package operators

import "github.com/hivearmor/event-processor/enrichment"

// DynamicOp dispatches to a named plugin handler.
// Currently implements com.hivearmor.geolocation inline.
func DynamicOp(pluginName string, params map[string]string, data map[string]any) {
	switch pluginName {
	case "com.hivearmor.geolocation":
		src := params["source"]
		dst := params["destination"]
		if src == "" || dst == "" {
			return
		}
		ip := getString(data, src)
		if ip == "" {
			return
		}
		geo := enrichment.Geolocate(ip)
		if geo != nil {
			setDeep(data, dst, geo)
		}
	}
}
