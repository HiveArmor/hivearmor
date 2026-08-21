//go:build tools

package main

// This file exists to pin dependencies that are consumed by packages under development.
// It will be removed once the geo/ package (task 2.2) imports maxminddb-golang directly.

import _ "github.com/oschwald/maxminddb-golang"
