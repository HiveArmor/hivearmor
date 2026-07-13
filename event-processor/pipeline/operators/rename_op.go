package operators

// RenameOp renames data[from[0]] to data[to].
func RenameOp(from []string, to string, data map[string]any) {
	if len(from) == 0 || to == "" {
		return
	}
	src := from[0]
	v, exists := getDeep(data, src)
	if !exists {
		return
	}
	setDeep(data, to, v)
	deleteDeep(data, src)
}
