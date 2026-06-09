# ADR 0006: Defer RabbitMQ

Status: Accepted

Do not add RabbitMQ to version 0.1.0. Redis already supports BullMQ and the
initial realtime event bridge. Preserve an `EventPublisherPort` so a later
RabbitMQ adapter can demonstrate integration events without forcing a fourth
stateful dependency into the MVP.
