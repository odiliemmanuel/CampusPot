// Package email sends transactional email — sign-up verification codes,
// password resets, referral rewards. Two implementations exist:
//
//   - SMTPSender delivers real mail through a configured SMTP relay.
//   - LogSender writes the message to the server log, so the demo works with
//     no mail server at all (and the verification code stays reachable in
//     dev via the API's devCode field).
//
// Nothing outside this package knows which one is in use.
package email

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strings"

	"github.com/odiliemmmanuel/campuspot/config"
)

// Sender delivers one transactional email.
type Sender interface {
	// Send mails to a single recipient. It returns an error when the message
	// could not be handed to the transport.
	Send(ctx context.Context, to, subject, htmlBody string) error
	// IsLog reports whether messages are only logged (no real delivery). The
	// API uses this to expose the code in dev responses so the demo can be
	// driven without a mail server.
	IsLog() bool
}

// New picks the sender implied by the configuration: SMTP when a host is set,
// the logging fallback otherwise.
func New(cfg *config.Config) Sender {
	if cfg.UseLogEmail() {
		return NewLogSender(cfg.EmailFrom)
	}
	return NewSMTPSender(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPassword, cfg.EmailFrom)
}

// SMTPSender delivers mail through an SMTP relay with optional AUTH.
type SMTPSender struct {
	host, port, user, pass, from string
}

// NewSMTPSender builds an SMTP sender. user/pass may be empty for an
// unauthenticated relay (e.g. localhost in development).
func NewSMTPSender(host, port, user, pass, from string) *SMTPSender {
	if port == "" {
		port = "587"
	}
	return &SMTPSender{host: host, port: port, user: user, pass: pass, from: from}
}

func (s *SMTPSender) IsLog() bool { return false }

func (s *SMTPSender) Send(_ context.Context, to, subject, htmlBody string) error {
	msg := strings.Join([]string{
		"From: " + s.from,
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
		"",
		htmlBody,
	}, "\r\n")

	var auth smtp.Auth
	if s.user != "" {
		auth = smtp.PlainAuth("", s.user, s.pass, s.host)
	}
	addr := net.JoinHostPort(s.host, s.port)
	if err := smtp.SendMail(addr, auth, s.from, []string{to}, []byte(msg)); err != nil {
		return fmt.Errorf("email: smtp send to %s: %w", to, err)
	}
	return nil
}

// LogSender writes mail to the server log instead of sending it. It is the
// default for demos and tests: the flow is exercised end to end, and the
// verification code can be read from the log (or the dev response field).
type LogSender struct {
	from string
}

// NewLogSender builds the logging fallback.
func NewLogSender(from string) *LogSender { return &LogSender{from: from} }

func (s *LogSender) IsLog() bool { return true }

func (s *LogSender) Send(_ context.Context, to, subject, htmlBody string) error {
	// Strip tags so the log shows the code itself, not the markup around it.
	text := strings.NewReplacer("<", "\n<").Replace(htmlBody)
	log.Printf("email: to=%s from=%q subject=%q\n%s", to, s.from, subject, text)
	return nil
}

// VerificationEmail is the HTML body for a one-time verification code. The
// same template serves sign-up verification and password reset.
func VerificationEmail(appName, headline, code string, minutes int) string {
	return fmt.Sprintf(`
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F7F5FF;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
    <h2 style="color:#4c1d95;margin:0 0 8px">%s</h2>
    <p style="color:#475569;font-size:14px">%s</p>
    <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#4c1d95;text-align:center;background:#f5f3ff;border-radius:12px;padding:16px">%s</p>
    <p style="color:#94a3b8;font-size:12px">This code expires in %d minutes. If you did not request it, you can ignore this email.</p>
  </div>
</body></html>`, appName, headline, code, minutes)
}

// NotificationEmail is a plain notification body (referral rewards, etc.).
func NotificationEmail(appName, headline, body string) string {
	return fmt.Sprintf(`
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F7F5FF;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
    <h2 style="color:#4c1d95;margin:0 0 8px">%s</h2>
    <p style="color:#475569;font-size:14px">%s</p>
    <p style="color:#334155;font-size:14px">%s</p>
  </div>
</body></html>`, appName, headline, body)
}
