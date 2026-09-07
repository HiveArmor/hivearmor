package telemetry

import "testing"

func TestCollectVitalsIncludesQueueAndDrops(t *testing.T) {
	origQ, origD, origP := QueueDepthFn, DroppedTotalFn, PolicyMetaFn
	t.Cleanup(func() {
		QueueDepthFn, DroppedTotalFn, PolicyMetaFn = origQ, origD, origP
	})

	QueueDepthFn = func() int { return 11 }
	DroppedTotalFn = func() int64 { return 7 }
	PolicyMetaFn = func() (int64, int) { return 42, 3 }

	v := CollectVitals()
	if v.DroppedTotal != 7 {
		t.Fatalf("DroppedTotal=%d want 7", v.DroppedTotal)
	}
	if v.QueueDepth != 11 {
		t.Fatalf("QueueDepth=%d want 11", v.QueueDepth)
	}
	if v.AppliedPolicyID != 42 || v.AppliedPolicyVersion != 3 {
		t.Fatalf("policy meta=%d:%d want 42:3", v.AppliedPolicyID, v.AppliedPolicyVersion)
	}
	if v.RamMb <= 0 {
		t.Fatalf("RamMb should be positive, got %d", v.RamMb)
	}
}
