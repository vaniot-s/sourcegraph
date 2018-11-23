package githuboauth

import (
	"context"
	"fmt"
	"net/url"
	"reflect"
	"testing"

	githublogin "github.com/dghubble/gologin/github"
	"github.com/google/go-github/github"
	"github.com/pkg/errors"
	"github.com/sourcegraph/sourcegraph/cmd/frontend/auth"
	"github.com/sourcegraph/sourcegraph/cmd/frontend/db"
	"github.com/sourcegraph/sourcegraph/pkg/actor"
	"github.com/sourcegraph/sourcegraph/pkg/extsvc"
	githubsvc "github.com/sourcegraph/sourcegraph/pkg/extsvc/github"
	"golang.org/x/oauth2"
)

func TestGetOrCreateUser(t *testing.T) {
	ghURL, _ := url.Parse("https://github.com")
	codeHost := githubsvc.NewCodeHost(ghURL)
	clientID := "client-id"

	{ // Mock
		userIDs := map[string]int32{ // username -> userID
			"alice": 1,
			"bob":   2,
		}
		orgs := map[string]*githubsvc.Organization{ // org login -> org
			"sourcegraph": &githubsvc.Organization{Login: "sourcegraph", ID: 1, NodeID: "1"},
		}
		userOrgs := map[string][]string{ // username -> orgs
			"alice": []string{"sourcegraph"},
			"bob":   []string{},
		}
		tokenUsers := map[string]string{ // access token -> username
			"alice-token": "alice",
			"bob-token":   "bob",
		}
		githubsvc.ListOrgsMock = func(ctx context.Context, token string) ([]*githubsvc.Organization, error) {
			username, ok := tokenUsers[token]
			if !ok {
				return nil, errors.New("invalid token")
			}
			orgnames := userOrgs[username]
			myOrgs := make([]*githubsvc.Organization, len(orgnames))
			for i, orgname := range orgnames {
				org, ok := orgs[orgname]
				if !ok {
					t.Fatalf("org not found for orgname %v", orgname)
				}
				myOrgs[i] = org
			}
			return myOrgs, nil
		}
		auth.MockCreateOrUpdateUser = func(newUser db.NewUser, spec extsvc.ExternalAccountSpec) (int32, error) {
			id, ok := userIDs[newUser.Username]
			if !ok {
				return 0, errors.New("user not found")
			}
			return id, nil
		}
	}

	cases := []struct {
		description string
		ghUser      *github.User
		accessToken string
		orgs        []string
		expActor    *actor.Actor
		expErrMsg   string
	}{
		{
			description: "org required, user meets org requirement -> session created",
			ghUser:      &github.User{Login: github.String("alice")},
			accessToken: "alice-token",
			orgs:        []string{"sourcegraph"},
			expActor:    &actor.Actor{UID: 1},
		},
		{
			description: "org required, user has multiple orgs and meets org requirement -> session created",
			ghUser:      &github.User{Login: github.String("alice")},
			accessToken: "alice-token",
			orgs:        []string{"other-org", "sourcegraph"},
			expActor:    &actor.Actor{UID: 1},
		},
		{
			description: "org required, user doesn't meet org requirement -> denied",
			ghUser:      &github.User{Login: github.String("alice")},
			accessToken: "alice-token",
			orgs:        []string{"other-org"},
			expErrMsg:   "GitHub user was not part of accepted organization",
		},
		{
			description: "orgs required, user has no orgs -> denied",
			ghUser:      &github.User{Login: github.String("bob")},
			accessToken: "bob-token",
			orgs:        []string{"sourcegraph"},
			expErrMsg:   "GitHub user was not part of accepted organization",
		},
		{
			description: "no orgs required, user has no orgs -> session created",
			ghUser:      &github.User{Login: github.String("bob")},
			accessToken: "bob-token",
			expActor:    &actor.Actor{UID: 2},
		},
	}
	for _, c := range cases {
		t.Run(c.description, func(t *testing.T) {
			ctx := githublogin.WithUser(context.Background(), c.ghUser)
			s := &sessionIssuerHelper{
				CodeHost: codeHost,
				clientID: clientID,
				orgs:     stringset(c.orgs),
			}
			tok := &oauth2.Token{AccessToken: c.accessToken}
			actr, _, err := s.GetOrCreateUser(ctx, tok)
			if got, exp := actr, c.expActor; !reflect.DeepEqual(got, exp) {
				t.Errorf("expected actor %v, got %v", exp, got)
			}
			if got, exp := fmt.Sprintf("%v", err), c.expErrMsg; !(err == nil && exp == "") && exp != got {
				t.Errorf("expected err %v, got %v", exp, got)
			}
		})
	}
}
