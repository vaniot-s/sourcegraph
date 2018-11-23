package github

import (
	"context"
	"fmt"
)

type Organization struct {
	Login       string `json:"login"`
	ID          int64  `json:"id"`
	NodeID      string `json:"node_id"`
	AvatarURL   string `json:"avatar_url"`
	Description string `json:"description"`
}

var ListOrgsMock func(context.Context, string) ([]*Organization, error)

func (c *Client) ListOrgs(ctx context.Context, token string) ([]*Organization, error) {
	if ListOrgsMock != nil {
		return ListOrgsMock(ctx, token)
	}

	var result []*Organization
	if err := c.requestGet(ctx, token, fmt.Sprintf("/user/orgs"), &result); err != nil {
		return nil, err
	}
	return result, nil
}
