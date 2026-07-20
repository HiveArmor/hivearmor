.PHONY: test-rules validate-schema

test-rules:
	@echo "Running rule test fixtures..."
	cd event-processor && go run ./cmd/rule-test/ --root ..
	@echo "Rule tests complete."

validate-schema:
	@echo "Validating rule schema..."
	cd event-processor && go run ./cmd/validate-schema/ --rules ../rules/
	@echo "Schema validation complete."
