package operators

// DeleteOp removes the listed fields from data.
func DeleteOp(fields []string, data map[string]any) {
	for _, f := range fields {
		deleteDeep(data, f)
	}
}
