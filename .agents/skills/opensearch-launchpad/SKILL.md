---
name: opensearch-launchpad
description: Guide from requirements to running OpenSearch search application — keyword/semantic/hybrid/agentic search strategies, Docker local deployment, AWS deployment, Search Builder UI, neural sparse, RAG pipeline setup. Triggered by "build search with OpenSearch", "OpenSearch search app", "neural search setup", "semantic search OpenSearch", "opensearch RAG".
---

# OpenSearch Launchpad

Guides from initial requirements to a fully running search application using OpenSearch.

## Search Strategies

| Strategy | Use Case | Requirement |
|---------|---------|------------|
| `bm25` | Keyword search, exact matching | Standard OpenSearch |
| `dense_vector` | Semantic similarity search | ML inference extension |
| `neural_sparse` | Learned sparse representation | OpenSearch ML plugin |
| `hybrid` | Combined keyword + semantic | Both of the above |
| `agentic` | LLM-driven retrieval with RAG | OpenSearch 3.2+, managed domain |

**Unstructured documents (PDF, DOCX):** default to `agentic` strategy.
**Conversational agents with memory/RAG:** require a managed domain, not Serverless.

## Deployment Targets

| Target | Requirement |
|--------|------------|
| `local` | Docker |
| `aws` | AWS credentials + region |

### Local Setup

```bash
# Start OpenSearch
bash scripts/start_opensearch.sh

# Or manually via Docker
docker run -d -p 9200:9200 -p 9600:9600 \
  -e "discovery.type=single-node" \
  -e "OPENSEARCH_INITIAL_ADMIN_PASSWORD=LocalDev@2024!" \
  opensearchproject/opensearch:latest
```

### AWS Deployment

AWS Serverless variants:
- **Classic Serverless** — does NOT scale to zero (always incurs compute cost)
- **Serverless NextGen** — supports scale-to-zero

For managed domains (RAG, agents): use OpenSearch Service managed, not Serverless.

## Workflow (Step by Step)

### Step 1 — Preflight Check (Always First)

```python
from opensearchpy import OpenSearch
client = OpenSearch(
    hosts=[{"host": "localhost", "port": 9200}],
    http_auth=("admin", "LocalDev@2024!"),
    use_ssl=True,
    verify_certs=False  # local dev only
)
# Verify connection
print(client.info())
print(client.cat.health())
```

### Step 2 — Sample Data

Supported input: JSON, CSV, PDF, DOCX, URLs, or built-in datasets.

```python
# Index sample documents
docs = [
    {"_id": "1", "title": "Security Alert", "body": "Suspicious login from IP..."},
    {"_id": "2", "title": "Incident Report", "body": "Ransomware detected on..."}
]
for doc in docs:
    client.index(index="hive-search", body=doc)
```

### Step 3 — Strategy Selection

Answer two questions: What search quality do you need? What resources are available?

### Step 4 — Index Configuration

```python
# BM25 (default — no extra config)
client.indices.create(index="hive-search")

# Dense vector (semantic)
client.indices.create(index="hive-search", body={
    "mappings": {
        "properties": {
            "embedding": {"type": "knn_vector", "dimension": 768}
        }
    },
    "settings": {"index.knn": True}
})
```

### Step 5 — Query

```python
# BM25 keyword search
client.search(index="hive-search", body={
    "query": {"match": {"body": "ransomware encrypted files"}}
})

# Semantic k-NN search
client.search(index="hive-search", body={
    "query": {
        "knn": {
            "embedding": {
                "vector": embedding_vector,  # from ML model
                "k": 10
            }
        }
    }
})
```

### Step 6 — Search Builder UI

After indexing, access the built-in Search Builder:

```bash
uv run python scripts/opensearch_ops.py launch-ui
# Opens at http://127.0.0.1:8765
```

## HiveArmor Integration Notes

- HiveArmor uses OpenSearch for log event storage (`_v3_hive_<type>-YYYY.MM.DD`)
- The index pattern is **immutable** — do not change
- Use `opensearch-log-analytics` skill for PPL log queries
- For neural search features, verify OpenSearch ML plugin is enabled in local-dev Docker stack
