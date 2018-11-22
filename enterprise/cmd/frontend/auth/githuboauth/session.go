package githuboauth

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	githublogin "github.com/dghubble/gologin/github"
	"github.com/pkg/errors"
	"github.com/sourcegraph/sourcegraph/cmd/frontend/db"
	"github.com/sourcegraph/sourcegraph/cmd/frontend/external/auth"
	"github.com/sourcegraph/sourcegraph/enterprise/cmd/frontend/auth/oauth"
	"github.com/sourcegraph/sourcegraph/pkg/actor"
	"github.com/sourcegraph/sourcegraph/pkg/extsvc"
	githubsvc "github.com/sourcegraph/sourcegraph/pkg/extsvc/github"
	"golang.org/x/oauth2"
)

type sessionIssuerHelper struct {
	*githubsvc.CodeHost
	clientID string
	orgs     map[string]struct{}
}

func (s *sessionIssuerHelper) GetOrCreateUser(ctx context.Context, token *oauth2.Token) (actr *actor.Actor, safeErrMsg string, err error) {
	ghUser, err := githublogin.UserFromContext(ctx)
	if err != nil {
		return nil, "Could not read GitHub user from callback request.", errors.Wrap(err, "could not read user from context")
	}

	// check org membership if orgs specified
	if len(s.orgs) > 0 {
		apiURL, _ := githubsvc.APIRoot(s.BaseURL())
		userOrgs, err := githubsvc.NewClient(apiURL, "", nil).ListOrgs(ctx, token.AccessToken)
		if err != nil {
			return nil, "Failed to fetch GitHub user orgs.", errors.Wrap(err, "failed to fetch GitHub user orgs")
		}
		hasAcceptedOrg := false
		for _, org := range userOrgs {
			if _, ok := s.orgs[org.Login]; ok {
				hasAcceptedOrg = true
				break
			}
		}
		if !hasAcceptedOrg {
			return nil, "GitHub user was not part of accepted organization.", errors.New("GitHub user was not part of accepted organization")
		}
	}

	login, err := auth.NormalizeUsername(deref(ghUser.Login))
	if err != nil {
		return nil, fmt.Sprintf("Error normalizing the username %q. See https://docs.sourcegraph.com/admin/auth/#username-normalization.", login), err
	}

	var data extsvc.ExternalAccountData
	data.SetAccountData(ghUser)
	data.SetAuthData(token)
	userID, safeErrMsg, err := auth.CreateOrUpdateUser(ctx, db.NewUser{
		Username:        login,
		Email:           deref(ghUser.Email),
		EmailIsVerified: deref(ghUser.Email) != "",
		DisplayName:     deref(ghUser.Name),
		AvatarURL:       deref(ghUser.AvatarURL),
	}, extsvc.ExternalAccountSpec{
		ServiceType: s.ServiceType(),
		ServiceID:   s.ServiceID(),
		ClientID:    s.clientID,
		AccountID:   strconv.FormatInt(derefInt64(ghUser.ID), 10),
	}, data)
	if err != nil {
		return nil, safeErrMsg, err
	}
	return actor.FromUser(userID), "", nil

}

func (s *sessionIssuerHelper) DeleteStateCookie(w http.ResponseWriter) {
	stateConfig := getStateConfig()
	stateConfig.MaxAge = -1
	http.SetCookie(w, oauth.NewCookie(stateConfig, ""))
}

func (s *sessionIssuerHelper) SessionData(token *oauth2.Token) oauth.SessionData {
	return oauth.SessionData{
		ID: auth.ProviderConfigID{
			ID:   s.ServiceID(),
			Type: s.ServiceType(),
		},
		AccessToken: token.AccessToken,
		TokenType:   token.Type(),
		// TODO(beyang): store and use refresh token to auto-refresh sessions
	}
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func derefInt64(i *int64) int64 {
	if i == nil {
		return 0
	}
	return *i
}
