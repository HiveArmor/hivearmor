package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/hivearmor/entity-graph/config"
	"github.com/hivearmor/entity-graph/consumer"
	graphneo4j "github.com/hivearmor/entity-graph/neo4j"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	client, err := graphneo4j.New(config.Neo4jURI, config.Neo4jUser, config.Neo4jPassword)
	if err != nil {
		log.Fatalf("entity-graph: %v", err)
	}
	defer client.Close()

	cfg := consumer.Config{
		Brokers: config.KafkaBrokers(),
		GroupID: config.KafkaConsumerGroup,
		Topic:   config.KafkaTopic,
	}

	for i := range config.KafkaWorkers {
		go consumer.StartWorker(ctx, cfg, client)
		log.Printf("entity-graph: worker %d/%d started", i+1, config.KafkaWorkers)
	}

	fmt.Printf("HiveArmor entity-graph started | neo4j=%s brokers=%v topic=%s workers=%d\n",
		config.Neo4jURI, config.KafkaBrokers(), config.KafkaTopic, config.KafkaWorkers)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	fmt.Println("entity-graph: shutting down")
}
