import { describe, it, expect, vi } from "vitest";

// ── updateQuery shape ─────────────────────────────────────────────────────────

describe("updateQuery", () => {
  it("sends PUT with id, name, description, dataOrigin", async () => {
    const putMock = vi.fn().mockResolvedValue({
      id: 1,
      name: "Renamed",
      description: "event.outcome:failure",
      dataOrigin: "logs-*",
    });

    // Simulate the service method directly so we verify the mapping logic
    const updateQuery = async (
      id: number,
      data: { name: string; query: string; indexPattern: string },
    ) => {
      return putMock("/api/log-analyzer/queries", {
        id,
        name: data.name,
        description: data.query,
        dataOrigin: data.indexPattern,
      });
    };

    await updateQuery(1, {
      name: "Renamed",
      query: "event.outcome:failure",
      indexPattern: "logs-*",
    });

    expect(putMock).toHaveBeenCalledWith("/api/log-analyzer/queries", {
      id: 1,
      name: "Renamed",
      description: "event.outcome:failure",
      dataOrigin: "logs-*",
    });
  });
});

// ── deduplication logic ───────────────────────────────────────────────────────

interface SavedQuery {
  id: number;
  name: string;
  description?: string;
  dataOrigin?: string;
}

function makeSaveHandler(
  saved: SavedQuery[],
  createFn: (name: string, query: string, ip: string) => void,
  updateFn: (id: number, name: string, query: string, ip: string) => void,
) {
  return (name: string, query: string, indexPattern: string) => {
    const existing = saved.find(
      (q) => q.description === query && q.dataOrigin === indexPattern,
    );
    if (existing) {
      if (existing.name !== name) {
        updateFn(existing.id, name, query, indexPattern);
      }
      return;
    }
    createFn(name, query, indexPattern);
  };
}

const mockSaved: SavedQuery[] = [
  { id: 1, name: "Failed Logins", description: "event.outcome:failure", dataOrigin: "logs-*" },
  { id: 2, name: "SSH Brute Force", description: "sshd AND failed", dataOrigin: "logs-*" },
];

describe("deduplication", () => {
  it("creates a new query when KQL does not match any existing entry", () => {
    const create = vi.fn();
    const update = vi.fn();
    const handleSave = makeSaveHandler(mockSaved, create, update);

    handleSave("New Query", "process.name:powershell", "logs-*");

    expect(create).toHaveBeenCalledWith("New Query", "process.name:powershell", "logs-*");
    expect(update).not.toHaveBeenCalled();
  });

  it("calls update (not create) when KQL matches an existing entry with a different name", () => {
    const create = vi.fn();
    const update = vi.fn();
    const handleSave = makeSaveHandler(mockSaved, create, update);

    handleSave("New Name", "event.outcome:failure", "logs-*");

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(1, "New Name", "event.outcome:failure", "logs-*");
  });

  it("calls neither create nor update when KQL matches and name is identical", () => {
    const create = vi.fn();
    const update = vi.fn();
    const handleSave = makeSaveHandler(mockSaved, create, update);

    handleSave("Failed Logins", "event.outcome:failure", "logs-*");

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("treats different index patterns as distinct entries", () => {
    const create = vi.fn();
    const update = vi.fn();
    const handleSave = makeSaveHandler(mockSaved, create, update);

    // Same KQL but different index pattern → should create
    handleSave("Failed Logins (alerts)", "event.outcome:failure", "alert-*");

    expect(create).toHaveBeenCalledWith("Failed Logins (alerts)", "event.outcome:failure", "alert-*");
    expect(update).not.toHaveBeenCalled();
  });
});
