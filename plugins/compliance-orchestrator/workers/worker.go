package workers

import (
	"context"
	"fmt"
	"runtime"
	"time"

	"github.com/threatwinds/go-sdk/catcher"
	"github.com/hivearmor/plugins/compliance-orchestrator/client"
	"github.com/hivearmor/plugins/compliance-orchestrator/evaluator"
	"github.com/hivearmor/plugins/compliance-orchestrator/models"
	"github.com/hivearmor/plugins/compliance-orchestrator/scheduler"
)

func StartWorkers(ctx context.Context, backend *client.BackendClient) {
	numWorkers := 2 * runtime.NumCPU()

	for i := 0; i < numWorkers; i++ {
		go func(id int) {

			eval := evaluator.NewEvaluator(backend)

			for cfg := range scheduler.Jobs {

				catcher.Info("Worker evaluating control", map[string]any{
					"worker":  id,
					"control": cfg.ID,
				})

				result, err := eval.Evaluate(ctx, cfg)
				if err != nil {
					catcher.Error("evaluation failed", err, map[string]any{
						"worker":  id,
						"control": cfg.ID,
					})
					continue
				}

				doc := models.EvaluationDocument{
					ControlID:        cfg.ID,
					ControlName:      cfg.ControlName,
					Status:           result.Status,
					Timestamp:        time.Now().UTC(),
					QueryEvaluations: result.QueryEvaluations,
				}

				err = backend.IndexEvaluationResult(ctx, fmt.Sprintf("v3_hive_compliance_evidence-%s", time.Now().UTC().Format("2006.01.02")), doc)
				if err != nil {
					catcher.Error("failed to index evaluation result", err, map[string]any{
						"worker":  id,
						"control": cfg.ID,
					})
					continue
				}

				catcher.Info("Control Evaluation stored successfully", map[string]any{
					"worker":  id,
					"control": cfg.ID,
					"status":  result.Status,
				})
			}
		}(i)
	}
}
