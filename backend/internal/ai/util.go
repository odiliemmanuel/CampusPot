package ai

import (
	"encoding/json"
	"time"
)

func timeNow() time.Time { return time.Now() }

// decodeReasons parses the JSON array of risk reasons stored on an expense.
// A malformed value degrades to an empty list rather than failing.
func decodeReasons(raw string) []string {
	if raw == "" {
		return nil
	}
	var reasons []string
	if err := json.Unmarshal([]byte(raw), &reasons); err != nil {
		return nil
	}
	return reasons
}
