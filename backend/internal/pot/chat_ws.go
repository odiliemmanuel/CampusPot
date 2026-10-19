package pot

import (
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/net/websocket"

	"github.com/odiliemmmanuel/campuspot/common/response"
	"github.com/odiliemmmanuel/campuspot/internal/auth"
)

type chatEvent struct {
	Type string          `json:"type"`
	Data ChatMessageView `json:"data"`
}

type chatSocketHub struct {
	sync.RWMutex
	rooms map[uuid.UUID]map[*websocket.Conn]struct{}
}

var chatBroadcast = chatSocketHub{rooms: make(map[uuid.UUID]map[*websocket.Conn]struct{})}

func (h *chatSocketHub) publish(groupID uuid.UUID, message *ChatMessageView) {
	if message == nil {
		return
	}
	event := chatEvent{Type: "message", Data: *message}
	h.Lock()
	defer h.Unlock()
	for conn := range h.rooms[groupID] {
		if err := websocket.JSON.Send(conn, event); err != nil {
			_ = conn.Close()
			delete(h.rooms[groupID], conn)
		}
	}
}

func (h *chatSocketHub) serve(c *gin.Context, svc *Service, authSvc *auth.Service) {
	protocols := strings.Split(c.GetHeader("Sec-WebSocket-Protocol"), ",")
	token := ""
	for _, protocol := range protocols {
		protocol = strings.TrimSpace(protocol)
		if strings.HasPrefix(protocol, "auth.") {
			token = strings.TrimPrefix(protocol, "auth.")
		}
	}
	userID, err := authSvc.Parse(token)
	if err != nil {
		response.Error(c, http.StatusUnauthorized, "INVALID_TOKEN", "token is invalid or expired")
		return
	}
	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "INVALID_ID", "invalid pot id")
		return
	}
	if _, err := svc.ChatParticipants(c.Request.Context(), groupID, userID); err != nil {
		response.Error(c, http.StatusForbidden, "FORBIDDEN", "active pot membership is required")
		return
	}
	server := websocket.Server{Handshake: func(config *websocket.Config, req *http.Request) error {
		config.Protocol = []string{"campuspot"}
		return nil
	}, Handler: func(conn *websocket.Conn) {
		h.Lock()
		if h.rooms[groupID] == nil {
			h.rooms[groupID] = make(map[*websocket.Conn]struct{})
		}
		h.rooms[groupID][conn] = struct{}{}
		h.Unlock()
		defer func() {
			h.Lock()
			delete(h.rooms[groupID], conn)
			if len(h.rooms[groupID]) == 0 {
				delete(h.rooms, groupID)
			}
			h.Unlock()
			_ = conn.Close()
		}()
		// Keep the connection alive and detect client disconnects. Message
		// writes are initiated by publish when a member posts or uploads.
		_, _ = io.Copy(io.Discard, conn)
	}}
	server.ServeHTTP(c.Writer, c.Request)
}

// RegisterChatWebSocket installs the token-authenticated websocket endpoint.
// The browser sends the token as a WebSocket subprotocol because browser
// WebSocket APIs cannot set an Authorization header; it is not put in the URL.
func (ct *Controller) RegisterChatWebSocket(rg *gin.RouterGroup, authSvc *auth.Service) {
	rg.GET("/groups/:id/chat/ws", func(c *gin.Context) { chatBroadcast.serve(c, ct.svc, authSvc) })
}
