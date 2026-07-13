package pipeline

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/threatwinds/go-sdk/plugins"
)

var (
	celOnce  sync.Once
	celCache *plugins.CELCache
)

func initCEL() {
	celOnce.Do(func() {
		celCache = plugins.NewCELCache("com.hivearmor.pipeline")
	})
}

// EvalWhere evaluates a where expression against a data map.
// Returns true when the condition is satisfied or when expression is empty.
func EvalWhere(expression string, data map[string]any) bool {
	if expression == "" {
		return true
	}
	initCEL()
	b, err := json.Marshal(data)
	if err != nil {
		return false
	}
	s := string(b)
	result, err := celCache.Evaluate(&s, expression)
	if err != nil {
		log.Printf("[pipeline.EvalWhere] CEL error expression=%q error=%v", expression, err)
		return false
	}
	return result
}
