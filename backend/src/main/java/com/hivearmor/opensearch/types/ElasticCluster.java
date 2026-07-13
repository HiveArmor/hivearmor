package com.hivearmor.opensearch.types;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Cluster health and resource summary returned by OpenSearch cat/nodes API.
 * Replaces com.hivearmor.opensearch_connector.types.ElasticCluster
 *
 * NOTE: com.hivearmor.domain.health_check.elasticsearch.ElasticCluster is a separate,
 * independently maintained class used by the health-check domain. This class is used
 * specifically by ElasticsearchService, MailService, and ElasticsearchResource for
 * connection-level cluster monitoring.
 */
public class ElasticCluster {

    private final ClusterResume resume = new ClusterResume();
    private final List<ElasticNode> nodes = new ArrayList<>();

    public List<ElasticNode> getNodes() {
        return nodes;
    }

    public ClusterResume getResume() {
        // Pre-compute aggregated values before returning
        resume.refreshAggregates(nodes);
        return resume;
    }

    /** Aggregated statistics across all cluster nodes. */
    public class ClusterResume {
        private float diskTotal;
        private float diskUsed;
        private float ramMax;
        private float ramCurrent;
        private float heapMax;
        private float heapCurrent;

        void refreshAggregates(List<ElasticNode> nodeList) {
            diskTotal   = nodeList.stream().map(ElasticNode::getDiskTotal)   .reduce(0f, Float::sum);
            diskUsed    = nodeList.stream().map(ElasticNode::getDiskUsed)    .reduce(0f, Float::sum);
            ramMax      = nodeList.stream().map(ElasticNode::getRamMax)      .reduce(0f, Float::sum);
            ramCurrent  = nodeList.stream().map(ElasticNode::getRamCurrent)  .reduce(0f, Float::sum);
            heapMax     = nodeList.isEmpty() ? 0f : nodeList.stream().map(ElasticNode::getHeapMax).reduce(0f, Float::sum) / nodeList.size();
            heapCurrent = nodeList.isEmpty() ? 0f : nodeList.stream().map(ElasticNode::getHeapCurrent).reduce(0f, Float::sum) / nodeList.size();
        }

        public float getDiskTotal()   { return round(diskTotal); }
        public float getDiskUsed()    { return round(diskUsed); }
        public float getDiskAvailable() {
            return nodes.stream().map(ElasticNode::getDiskAvailable).reduce(0f, Float::sum);
        }

        /** Returns disk usage as a percentage (0–100). Used by preventSystemCrashBySpace(). */
        public float getDiskUsedPercent() {
            if (diskTotal == 0) return 0f;
            return round(diskUsed / diskTotal * 100f);
        }

        public float getRamMax()      { return round(ramMax); }
        public float getRamCurrent()  { return round(ramCurrent); }
        public float getRamPercent() {
            if (ramMax == 0) return 0f;
            return round(ramCurrent / ramMax * 100f);
        }

        public float getCpuPercent() {
            if (nodes.isEmpty()) return 0f;
            return nodes.stream().map(ElasticNode::getCpuPercent).reduce(0f, Float::sum) / nodes.size();
        }

        public float getHeapMax()     { return round(heapMax); }
        public float getHeapCurrent() { return round(heapCurrent); }
        public float getHeapPercent() {
            if (heapMax == 0) return 0f;
            return round(heapCurrent / heapMax * 100f);
        }

        private static float round(float value) {
            return Float.parseFloat(String.format(Locale.US, "%.2f", value));
        }
    }

    /** Represents a single OpenSearch node's resource stats. */
    public static class ElasticNode {
        private String name;
        private float diskTotal;
        private float diskUsed;
        private float diskAvailable;
        private float ramMax;
        private float ramCurrent;
        private float cpuPercent;
        private float heapMax;
        private float heapCurrent;

        public String getName()           { return name; }
        public void   setName(String v)   { this.name = v; }
        public float getDiskTotal()       { return diskTotal; }
        public void  setDiskTotal(float v){ this.diskTotal = v; }
        public float getDiskUsed()        { return diskUsed; }
        public void  setDiskUsed(float v) { this.diskUsed = v; }
        public float getDiskAvailable()       { return diskAvailable; }
        public void  setDiskAvailable(float v){ this.diskAvailable = v; }
        public float getRamMax()          { return ramMax; }
        public void  setRamMax(float v)   { this.ramMax = v; }
        public float getRamCurrent()      { return ramCurrent; }
        public void  setRamCurrent(float v){ this.ramCurrent = v; }
        public float getCpuPercent()      { return cpuPercent; }
        public void  setCpuPercent(float v){ this.cpuPercent = v; }
        public float getHeapMax()         { return heapMax; }
        public void  setHeapMax(float v)  { this.heapMax = v; }
        public float getHeapCurrent()     { return heapCurrent; }
        public void  setHeapCurrent(float v){ this.heapCurrent = v; }
    }
}
