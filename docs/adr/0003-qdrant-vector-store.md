# ADR 0003: Qdrant for Vector Retrieval

Status: Accepted

Use PostgreSQL as the source of truth and Qdrant for vectors and similarity
search. Every point carries tenant and document metadata, and every search
requires a tenant filter. This adds infrastructure but makes vector-store
responsibilities and failure modes explicit for the learning goal.
