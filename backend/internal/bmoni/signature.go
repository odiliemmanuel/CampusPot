package bmoni

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
)

// VerifySignature checks the X-Webhook-Signature header against an
// HMAC-SHA256 of the raw request body, keyed with the subscription secret.
//
// It must be given the RAW body bytes exactly as received — decoding and
// re-encoding the JSON changes key order/whitespace and breaks the digest.
// The comparison is constant-time (hmac.Equal) to avoid timing attacks.
func VerifySignature(rawBody []byte, signatureHex, secret string) bool {
	if secret == "" || signatureHex == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(signatureHex), []byte(expected))
}

// Sign produces the hex HMAC-SHA256 digest for a body. Exposed for tests and
// for local tools that simulate a delivery.
func Sign(rawBody []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(rawBody)
	return hex.EncodeToString(mac.Sum(nil))
}
