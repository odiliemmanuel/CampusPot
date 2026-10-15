// Package response gives every controller a single, consistent JSON
// envelope so the frontend never has to guess the shape of a response.
package response

import "github.com/gin-gonic/gin"

// Envelope is the standard shape for every API response.
type Envelope struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   *ErrorBody  `json:"error,omitempty"`
	Meta    interface{} `json:"meta,omitempty"`
}

// ErrorBody carries a machine-readable code plus a human-readable message,
// so the frontend can branch on code without string-matching messages.
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// OK sends a 200 with data.
func OK(c *gin.Context, data interface{}) {
	c.JSON(200, Envelope{Success: true, Data: data})
}

// Created sends a 201 with data.
func Created(c *gin.Context, data interface{}) {
	c.JSON(201, Envelope{Success: true, Data: data})
}

// WithMeta sends a 200 with data plus pagination/meta info.
func WithMeta(c *gin.Context, data interface{}, meta interface{}) {
	c.JSON(200, Envelope{Success: true, Data: data, Meta: meta})
}

// Error sends an error envelope with the given HTTP status, code, and message.
func Error(c *gin.Context, status int, code, message string) {
	c.JSON(status, Envelope{
		Success: false,
		Error:   &ErrorBody{Code: code, Message: message},
	})
}
