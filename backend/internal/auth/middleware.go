package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/odiliemmmanuel/campuspot/common/response"
)

const contextUserIDKey = "campuspot.userID"

// RequireAuth rejects requests without a valid Bearer token and stores the
// authenticated user id in the gin context.
func (s *Service) RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			response.Error(c, http.StatusUnauthorized, "UNAUTHENTICATED", "missing bearer token")
			c.Abort()
			return
		}
		userID, err := s.Parse(strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			response.Error(c, http.StatusUnauthorized, "INVALID_TOKEN", "token is invalid or expired")
			c.Abort()
			return
		}
		c.Set(contextUserIDKey, userID)
		c.Next()
	}
}

// CurrentUserID returns the authenticated user id from the context.
func CurrentUserID(c *gin.Context) (uuid.UUID, bool) {
	v, ok := c.Get(contextUserIDKey)
	if !ok {
		return uuid.Nil, false
	}
	id, ok := v.(uuid.UUID)
	return id, ok
}

// MustUserID is a convenience for handlers behind RequireAuth, where the id
// is guaranteed to exist.
func MustUserID(c *gin.Context) uuid.UUID {
	id, _ := CurrentUserID(c)
	return id
}
