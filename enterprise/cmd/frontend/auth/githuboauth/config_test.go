package githuboauth

import (
	"reflect"
	"testing"

	"github.com/davecgh/go-spew/spew"
	"github.com/sergi/go-diff/diffmatchpatch"
	"github.com/sourcegraph/sourcegraph/cmd/frontend/auth"
	"github.com/sourcegraph/sourcegraph/enterprise/cmd/frontend/auth/oauth"
	githubcodehost "github.com/sourcegraph/sourcegraph/pkg/extsvc/github"
	"github.com/sourcegraph/sourcegraph/schema"
	"golang.org/x/oauth2"
)

type wantProvider struct {
	cfg      schema.GitHubAuthProvider
	provider auth.Provider
}

func Test_parseConfig(t *testing.T) {
	spew.Config.DisablePointerAddresses = true
	spew.Config.SortKeys = true
	spew.Config.SpewKeys = true

	type args struct {
		cfg *schema.SiteConfiguration
	}
	tests := []struct {
		name          string
		args          args
		wantProviders []wantProvider
		wantProblems  []string
	}{
		{
			name:          "No configs",
			args:          args{cfg: &schema.SiteConfiguration{}},
			wantProviders: []wantProvider{},
		},
		{
			name: "1 GitHub.com config",
			args: args{cfg: &schema.SiteConfiguration{
				AuthProviders: []schema.AuthProviders{{
					Github: &schema.GitHubAuthProvider{
						ClientID:     "my-client-id",
						ClientSecret: "my-client-secret",
						DisplayName:  "GitHub",
						Type:         "github",
						Url:          "https://github.com",
					},
				}},
			}},
			wantProviders: []wantProvider{{
				cfg: schema.GitHubAuthProvider{
					ClientID:     "my-client-id",
					ClientSecret: "my-client-secret",
					DisplayName:  "GitHub",
					Type:         "github",
					Url:          "https://github.com",
				},
				provider: provider("https://github.com/", oauth2.Config{
					ClientID:     "my-client-id",
					ClientSecret: "my-client-secret",
					Endpoint: oauth2.Endpoint{
						AuthURL:  "https://github.com/login/oauth/authorize",
						TokenURL: "https://github.com/login/oauth/access_token",
					},
					Scopes: []string{"repo"},
				}),
			}},
		},
		{
			name: "2 GitHub configs",
			args: args{cfg: &schema.SiteConfiguration{
				AuthProviders: []schema.AuthProviders{{
					Github: &schema.GitHubAuthProvider{
						ClientID:     "my-client-id",
						ClientSecret: "my-client-secret",
						DisplayName:  "GitHub",
						Type:         "github",
						Url:          "https://github.com",
					},
				}, {
					Github: &schema.GitHubAuthProvider{
						ClientID:     "my-client-id-2",
						ClientSecret: "my-client-secret-2",
						DisplayName:  "GitHub Enterprise",
						Type:         "github",
						Url:          "https://mycompany.com",
					},
				}},
			}},
			wantProviders: []wantProvider{{
				cfg: schema.GitHubAuthProvider{
					ClientID:     "my-client-id",
					ClientSecret: "my-client-secret",
					DisplayName:  "GitHub",
					Type:         "github",
					Url:          "https://github.com",
				},
				provider: provider("https://github.com/", oauth2.Config{
					ClientID:     "my-client-id",
					ClientSecret: "my-client-secret",
					Endpoint: oauth2.Endpoint{
						AuthURL:  "https://github.com/login/oauth/authorize",
						TokenURL: "https://github.com/login/oauth/access_token",
					},
					Scopes: []string{"repo"},
				}),
			}, {
				cfg: schema.GitHubAuthProvider{
					ClientID:     "my-client-id-2",
					ClientSecret: "my-client-secret-2",
					DisplayName:  "GitHub Enterprise",
					Type:         "github",
					Url:          "https://mycompany.com",
				},
				provider: provider("https://mycompany.com/", oauth2.Config{
					ClientID:     "my-client-id-2",
					ClientSecret: "my-client-secret-2",
					Endpoint: oauth2.Endpoint{
						AuthURL:  "https://mycompany.com/login/oauth/authorize",
						TokenURL: "https://mycompany.com/login/oauth/access_token",
					},
					Scopes: []string{"repo"},
				}),
			}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotProviders, gotProblems := parseConfig(tt.args.cfg)
			for _, p := range gotProviders {
				if p, ok := p.(*oauth.Provider); ok {
					p.Login, p.Callback = nil, nil
					p.ProviderOp.Login, p.ProviderOp.Callback = nil, nil
				}
			}
			for _, wp := range tt.wantProviders {
				k, p := wp.cfg, wp.provider
				if q, ok := p.(*oauth.Provider); ok {
					q.SourceConfig = schema.AuthProviders{Github: &k}
				}
			}
			if wantProviders := p(tt.wantProviders); !reflect.DeepEqual(gotProviders, wantProviders) {
				dmp := diffmatchpatch.New()

				t.Errorf("parseConfig() gotProviders != wantProviders, diff:\n%s",
					dmp.DiffPrettyText(dmp.DiffMain(spew.Sdump(wantProviders), spew.Sdump(gotProviders), false)),
				)
			}
			if !reflect.DeepEqual(gotProblems, tt.wantProblems) {
				t.Errorf("parseConfig() gotProblems = %v, want %v", gotProblems, tt.wantProblems)
			}
		})
	}
}

func provider(serviceID string, oauth2Config oauth2.Config) *oauth.Provider {
	op := oauth.ProviderOp{
		AuthPrefix:   authPrefix,
		OAuth2Config: oauth2Config,
		StateConfig:  getStateConfig(),
		ServiceID:    serviceID,
		ServiceType:  githubcodehost.ServiceType,
	}
	return &oauth.Provider{ProviderOp: op}
}

func p(providers []wantProvider) map[githubAuthProviderKey]auth.Provider {
	if providers == nil {
		return nil
	}
	m := make(map[githubAuthProviderKey]auth.Provider)
	for _, wp := range providers {
		m[mapKey(&wp.cfg)] = wp.provider
	}
	return m
}
