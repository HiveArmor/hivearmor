package main

import (
	"github.com/hivearmor/agent/cmd"
	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
)

func main() {
	utils.InitLogger(config.ServiceLogFile)
	cmd.Execute()
}
