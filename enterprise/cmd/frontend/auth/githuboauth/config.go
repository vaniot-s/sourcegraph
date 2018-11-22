package githuboauth

import (
	"encoding/json"
	"os"
	"strings"
	"sync"

	"github.com/dghubble/gologin"
	"github.com/sourcegraph/sourcegraph/cmd/frontend/external/auth"
	"github.com/sourcegraph/sourcegraph/pkg/conf"
	"github.com/sourcegraph/sourcegraph/schema"
	log15 "gopkg.in/inconshreveable/log15.v2"
)

var (
	ffIsEnabled bool
)

func init() {
	// HACK: don't run this watch loop in tests, because it results in a race condition.
	// This can be removed once the feature flag is removed.
	if strings.HasSuffix(os.Args[0], ".test") {
		ffIsEnabled = true
		return
	}

	var (
		mu  sync.Mutex
		cur = map[githubAuthProviderKey]auth.Provider{} // tracks current mapping of valid config to auth.Provider
	)

	go func() {
		conf.Watch(func() {
			mu.Lock()
			defer mu.Unlock()

			if !conf.Get().ExperimentalFeatures.GithubAuth {
				new := map[githubAuthProviderKey]auth.Provider{}
				updates := make(map[auth.Provider]bool)
				for c, p := range cur {
					if _, ok := new[c]; !ok {
						updates[p] = false
					}
				}
				auth.UpdateProviders(updates)
				cur = new
				ffIsEnabled = false
				return
			}

			log15.Info("Reloading changed GitHub OAuth authentication provider configuration.")

			new, _ := parseConfig(conf.Get())
			updates := make(map[auth.Provider]bool)
			for c, p := range cur {
				if _, ok := new[c]; !ok {
					updates[p] = false
				}
			}
			for c, p := range new {
				if _, ok := cur[c]; !ok {
					updates[p] = true
				}
			}
			auth.UpdateProviders(updates)
			cur = new
			ffIsEnabled = true
		})
	}()
	conf.ContributeValidator(func(cfg schema.SiteConfiguration) (problems []string) {
		_, problems = parseConfig(&cfg)
		return problems
	})
}

type githubAuthProviderKey string

func mapKey(g *schema.GitHubAuthProvider) githubAuthProviderKey {
	b, _ := json.Marshal(g)
	return githubAuthProviderKey(b)
}

func parseConfig(cfg *schema.SiteConfiguration) (providers map[githubAuthProviderKey]auth.Provider, problems []string) {
	providers = make(map[githubAuthProviderKey]auth.Provider)
	for _, pr := range cfg.AuthProviders {
		if pr.Github == nil {
			continue
		}

		provider, providerProblems := parseProvider(pr.Github, pr)
		problems = append(problems, providerProblems...)
		if provider != nil {
			providers[mapKey(pr.Github)] = provider
		}
	}
	return providers, problems
}

func getStateConfig() gologin.CookieConfig {
	cfg := gologin.CookieConfig{
		Name:     "github-state-cookie",
		Path:     "/",
		MaxAge:   120, // 120 seconds
		HTTPOnly: true,
	}
	if conf.Get().TlsCert != "" {
		cfg.Secure = true
	}
	return cfg
}
