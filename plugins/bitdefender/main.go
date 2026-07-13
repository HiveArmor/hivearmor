package main

import (
	"runtime"

	"github.com/threatwinds/go-sdk/plugins"

	"github.com/hivearmor/plugins/bitdefender/config"
	"github.com/hivearmor/plugins/bitdefender/server"
)

func main() {
	mode := plugins.GetCfg("plugin_com.hivearmor.bitdefender").Env.Mode
	if mode != "manager" {
		return
	}

	go config.StartConfigurationSystem()

	for t := 0; t < 2*runtime.NumCPU(); t++ {
		go func() {
			plugins.SendLogsFromChannel("com.hivearmor.bitdefender")
		}()
	}

	server.StartServer()
}
