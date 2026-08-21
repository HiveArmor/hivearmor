package utils

import "testing"

func TestBoundInventoryPageClampsUnboundedRequests(t *testing.T) {
	page, size := BoundInventoryPage(0, 100000)
	if page != 1 {
		t.Fatalf("page = %d, want 1", page)
	}
	if size != maxInventoryPageSize {
		t.Fatalf("size = %d, want %d", size, maxInventoryPageSize)
	}

	page, size = BoundInventoryPage(3, 0)
	if page != 3 || size != 20 {
		t.Fatalf("got page=%d size=%d", page, size)
	}

	page, size = BoundInventoryPage(2, 50)
	if page != 2 || size != 50 {
		t.Fatalf("got page=%d size=%d", page, size)
	}
}
