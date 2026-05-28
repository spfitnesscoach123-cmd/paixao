"""
Rolling Load Engine

Main engine that orchestrates EWMA, ACWR, Monotony, Strain, and Spike calculations.
Maintains incremental updates in the database for high performance.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase

from .load_metrics import (
    TRACKED_METRICS,
    AthleteLoadMetrics,
    MetricValues,
    LoadEngineInput,
    LoadEngineResult,
    ACWRZone,
    SpikeStatus,
    MONOTONY_WINDOW,
)
from .ewma_calculator import EWMACalculator
from .acwr_calculator import ACWRCalculator
from .spike_detector import SpikeDetector
from utils.gps_session_resolver import resolve_session_records

logger = logging.getLogger(__name__)


class RollingLoadEngine:
    """
    Rolling Load Engine for incremental workload metric calculations.
    
    This engine:
    1. Maintains EWMA values incrementally (no full recalculation)
    2. Calculates ACWR using EWMA (more accurate than simple rolling average)
    3. Calculates weekly monotony and strain
    4. Detects workload spikes
    5. Stores all metrics in athlete_load_metrics collection
    
    Usage:
        engine = RollingLoadEngine(db)
        result = await engine.update_athlete_metrics(athlete_id, coach_id, date, loads)
    """
    
    COLLECTION_NAME = "athlete_load_metrics"
    
    def __init__(self, db: AsyncIOMotorDatabase):
        """
        Initialize the Rolling Load Engine.
        
        Args:
            db: MongoDB database instance
        """
        self.db = db
        self.collection = db[self.COLLECTION_NAME]
        self.ewma_calc = EWMACalculator()
        self.acwr_calc = ACWRCalculator()
        self.spike_detector = SpikeDetector()
    
    async def ensure_indexes(self):
        """Create necessary indexes for performance."""
        await self.collection.create_index([("athlete_id", 1), ("date", -1)])
        await self.collection.create_index([("coach_id", 1)])
        await self.collection.create_index([("date", -1)])
        await self.collection.create_index(
            [("athlete_id", 1), ("date", 1)],
            unique=True
        )
        logger.info("[LoadEngine] Indexes created")
    
    async def get_previous_metrics(
        self,
        athlete_id: str,
        before_date: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get the most recent stored metrics before a given date.
        
        Args:
            athlete_id: Athlete ID
            before_date: Date string (YYYY-MM-DD)
            
        Returns:
            Previous metrics document or None
        """
        return await self.collection.find_one(
            {
                "athlete_id": athlete_id,
                "date": {"$lt": before_date}
            },
            sort=[("date", -1)]
        )
    
    async def get_metrics_for_date(
        self,
        athlete_id: str,
        date: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get stored metrics for a specific date.
        
        Args:
            athlete_id: Athlete ID
            date: Date string (YYYY-MM-DD)
            
        Returns:
            Metrics document or None
        """
        return await self.collection.find_one({
            "athlete_id": athlete_id,
            "date": date
        })
    
    async def get_recent_metrics(
        self,
        athlete_id: str,
        days: int = 7
    ) -> List[Dict[str, Any]]:
        """
        Get recent metrics for monotony/strain calculation.
        
        Args:
            athlete_id: Athlete ID
            days: Number of days to retrieve
            
        Returns:
            List of metrics documents (newest first)
        """
        cursor = self.collection.find(
            {"athlete_id": athlete_id}
        ).sort("date", -1).limit(days)
        
        return await cursor.to_list(length=days)
    
    async def aggregate_gps_for_date(
        self,
        athlete_id: str,
        coach_id: str,
        date: str
    ) -> Dict[str, float]:
        """
        Aggregate GPS data for a specific date WITH session/period dedup.

        Source-of-truth resolution is delegated to the central GPS session
        resolver (utils/gps_session_resolver.py) — strict priority P1
        record_type=session_total → P2 explicit record_type → P3
        has_session_total → P4 legacy keywords → P5 sum all. The grouping by
        session_name, the totals dict shape, and the summation are preserved
        bit-for-bit.

        Args:
            athlete_id: Athlete ID
            coach_id: Coach ID
            date: Date string (YYYY-MM-DD)

        Returns:
            Dict with aggregated loads for each metric
        """
        gps_records = await self.db.gps_data.find({
            "athlete_id": athlete_id,
            "coach_id": coach_id,
            "date": date
        }).to_list(100)

        totals = {
            "distance": 0.0,
            "hsr": 0.0,
            "sprint_distance": 0.0,
            "acc_dec_load": 0.0,
            "high_intensity_distance": 0.0,
            "number_of_sprints": 0.0,
        }

        if not gps_records:
            return totals

        # Group records by session_name
        grouped: Dict[str, list] = {}
        for record in gps_records:
            sname = record.get("session_name") or "default"
            grouped.setdefault(sname, []).append(record)

        # For each session, resolve via central resolver
        for sname, records in grouped.items():
            source = resolve_session_records(records)

            for r in source:
                totals["distance"] += float(r.get("total_distance", 0) or 0)
                totals["hsr"] += float(r.get("high_speed_running", 0) or 0)
                totals["sprint_distance"] += float(r.get("sprint_distance", 0) or 0)
                totals["high_intensity_distance"] += float(r.get("high_intensity_distance", 0) or 0)
                totals["number_of_sprints"] += float(r.get("number_of_sprints", 0) or 0)
                acc = float(r.get("number_of_accelerations", 0) or 0)
                dec = float(r.get("number_of_decelerations", 0) or 0)
                totals["acc_dec_load"] += acc + dec

        return totals
    
    def calculate_metric_values(
        self,
        metric_name: str,
        current_load: float,
        previous_metrics: Optional[Dict[str, Any]],
        is_first_day: bool
    ) -> MetricValues:
        """
        Calculate EWMA and ACWR for a single metric.
        
        Args:
            metric_name: Name of the metric (distance, hsr, etc.)
            current_load: Today's load value
            previous_metrics: Previous day's stored metrics
            is_first_day: Whether this is the first day with data
            
        Returns:
            MetricValues with calculated values
        """
        # Get previous EWMA values
        prev_acute = None
        prev_chronic = None
        
        if previous_metrics and metric_name in previous_metrics:
            prev_data = previous_metrics[metric_name]
            if isinstance(prev_data, dict):
                prev_acute = prev_data.get("ewma_acute")
                prev_chronic = prev_data.get("ewma_chronic")
        
        # Calculate EWMA
        ewma_acute, ewma_chronic = self.ewma_calc.calculate_both(
            current_load,
            prev_acute,
            prev_chronic,
            is_first_day
        )
        
        # Calculate ACWR
        acwr, acwr_zone = self.acwr_calc.calculate_with_zone(ewma_acute, ewma_chronic)
        
        return MetricValues(
            load=round(current_load, 2),
            ewma_acute=round(ewma_acute, 2),
            ewma_chronic=round(ewma_chronic, 2),
            acwr=acwr,
            acwr_zone=acwr_zone
        )
    
    async def calculate_weekly_metrics(
        self,
        athlete_id: str,
        current_date: str,
        current_load: float
    ) -> Dict[str, float]:
        """
        Calculate monotony and strain from recent loads.
        
        Args:
            athlete_id: Athlete ID
            current_date: Current date
            current_load: Today's total distance load
            
        Returns:
            Dict with monotony, strain, weekly_load
        """
        # Get last 6 days of metrics (+ today = 7 days)
        recent = await self.get_recent_metrics(athlete_id, days=6)
        
        # Build load array (oldest to newest)
        daily_loads = []
        for m in reversed(recent):
            if m.get("distance") and isinstance(m["distance"], dict):
                daily_loads.append(m["distance"].get("load", 0))
            elif m.get("distance_load"):
                daily_loads.append(m.get("distance_load", 0))
            else:
                daily_loads.append(0)
        
        # Add current day
        daily_loads.append(current_load)
        
        # Ensure we have 7 values (pad with 0 if needed)
        while len(daily_loads) < MONOTONY_WINDOW:
            daily_loads.insert(0, 0)
        
        # Take last 7 days
        daily_loads = daily_loads[-MONOTONY_WINDOW:]
        
        return self.spike_detector.calculate_weekly_metrics(daily_loads)
    
    async def update_athlete_metrics(
        self,
        athlete_id: str,
        coach_id: str,
        date: str,
        loads: Optional[Dict[str, float]] = None
    ) -> LoadEngineResult:
        """
        Update load metrics for an athlete on a specific date.
        
        This is the main entry point for the engine.
        
        Args:
            athlete_id: Athlete ID
            coach_id: Coach ID
            date: Date string (YYYY-MM-DD)
            loads: Optional pre-calculated loads (will aggregate from GPS if None)
            
        Returns:
            LoadEngineResult with success status and calculated metrics
        """
        try:
            logger.info(f"[LoadEngine] Updating metrics for athlete {athlete_id} on {date}")
            
            # Get loads from GPS data if not provided
            if loads is None:
                loads = await self.aggregate_gps_for_date(athlete_id, coach_id, date)
            
            # Get previous day's metrics
            previous = await self.get_previous_metrics(athlete_id, date)
            is_first_day = previous is None
            
            # Calculate metrics for each tracked metric
            distance_values = self.calculate_metric_values(
                "distance", loads.get("distance", 0), previous, is_first_day
            )
            hsr_values = self.calculate_metric_values(
                "hsr", loads.get("hsr", 0), previous, is_first_day
            )
            sprint_values = self.calculate_metric_values(
                "sprint_distance", loads.get("sprint_distance", 0), previous, is_first_day
            )
            acc_dec_values = self.calculate_metric_values(
                "acc_dec_load", loads.get("acc_dec_load", 0), previous, is_first_day
            )
            hid_values = self.calculate_metric_values(
                "high_intensity_distance", loads.get("high_intensity_distance", 0), previous, is_first_day
            )
            sprints_count_values = self.calculate_metric_values(
                "number_of_sprints", loads.get("number_of_sprints", 0), previous, is_first_day
            )
            
            # Calculate weekly metrics (using distance as primary)
            weekly = await self.calculate_weekly_metrics(
                athlete_id, date, loads.get("distance", 0)
            )
            
            # Detect spikes across all metrics
            spike_metrics = []
            worst_spike = SpikeStatus.NONE
            
            for metric_name, values in [
                ("distance", distance_values),
                ("hsr", hsr_values),
                ("sprint_distance", sprint_values),
                ("acc_dec_load", acc_dec_values),
                ("high_intensity_distance", hid_values),
                ("number_of_sprints", sprints_count_values),
            ]:
                has_spike, status = self.spike_detector.detect_spike_from_acwr(values.acwr)
                if has_spike:
                    spike_metrics.append(metric_name)
                    if status.value > worst_spike.value:
                        worst_spike = status
            
            # Build complete metrics document
            metrics = AthleteLoadMetrics(
                athlete_id=athlete_id,
                coach_id=coach_id,
                date=date,
                distance=distance_values,
                hsr=hsr_values,
                sprint_distance=sprint_values,
                acc_dec_load=acc_dec_values,
                high_intensity_distance=hid_values,
                number_of_sprints=sprints_count_values,
                monotony=weekly["monotony"],
                strain=weekly["strain"],
                weekly_load=weekly["weekly_load"],
                has_spike=len(spike_metrics) > 0,
                spike_metrics=spike_metrics,
                spike_status=worst_spike,
                updated_at=datetime.utcnow()
            )
            
            # Upsert to database
            await self.collection.update_one(
                {"athlete_id": athlete_id, "date": date},
                {"$set": metrics.dict()},
                upsert=True
            )
            
            logger.info(f"[LoadEngine] Metrics updated: ACWR(distance)={distance_values.acwr}, monotony={weekly['monotony']}")
            
            return LoadEngineResult(
                success=True,
                athlete_id=athlete_id,
                date=date,
                metrics=metrics
            )
            
        except Exception as e:
            logger.error(f"[LoadEngine] Error updating metrics: {e}")
            return LoadEngineResult(
                success=False,
                athlete_id=athlete_id,
                date=date,
                error=str(e)
            )
    
    async def recalculate_from_date(
        self,
        athlete_id: str,
        coach_id: str,
        start_date: str
    ) -> List[LoadEngineResult]:
        """
        Recalculate metrics from a specific date forward.
        
        Use this when historical data is modified.
        
        Args:
            athlete_id: Athlete ID
            coach_id: Coach ID
            start_date: Date to start recalculation from
            
        Returns:
            List of results for each date
        """
        results = []
        
        # Get all GPS dates from start_date forward
        gps_dates = await self.db.gps_data.distinct(
            "date",
            {
                "athlete_id": athlete_id,
                "coach_id": coach_id,
                "date": {"$gte": start_date}
            }
        )
        
        # Sort dates
        gps_dates = sorted(gps_dates)
        
        # Also generate dates between to ensure we have continuous EWMA
        if gps_dates:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            end = datetime.strptime(gps_dates[-1], "%Y-%m-%d")
            
            all_dates = []
            current = start
            while current <= end:
                all_dates.append(current.strftime("%Y-%m-%d"))
                current += timedelta(days=1)
        else:
            all_dates = []
        
        # Recalculate for each date
        for date in all_dates:
            result = await self.update_athlete_metrics(athlete_id, coach_id, date)
            results.append(result)
        
        return results
    
    async def get_latest_metrics(
        self,
        athlete_id: str
    ) -> Optional[AthleteLoadMetrics]:
        """
        Get the most recent metrics for an athlete.
        
        Args:
            athlete_id: Athlete ID
            
        Returns:
            Latest AthleteLoadMetrics or None
        """
        doc = await self.collection.find_one(
            {"athlete_id": athlete_id},
            sort=[("date", -1)]
        )
        
        if doc:
            doc.pop("_id", None)
            return AthleteLoadMetrics(**doc)
        
        return None
    
    async def get_team_metrics(
        self,
        coach_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get latest metrics for all athletes belonging to a coach.
        
        Args:
            coach_id: Coach ID
            
        Returns:
            List of latest metrics per athlete
        """
        # Aggregate to get latest per athlete
        pipeline = [
            {"$match": {"coach_id": coach_id}},
            {"$sort": {"date": -1}},
            {"$group": {
                "_id": "$athlete_id",
                "latest": {"$first": "$$ROOT"}
            }},
            {"$replaceRoot": {"newRoot": "$latest"}},
            {"$project": {"_id": 0}}
        ]
        
        cursor = self.collection.aggregate(pipeline)
        return await cursor.to_list(length=100)
    
    async def delete_athlete_metrics(
        self,
        athlete_id: str
    ) -> int:
        """
        Delete all stored metrics for an athlete.
        
        Args:
            athlete_id: Athlete ID
            
        Returns:
            Number of deleted documents
        """
        result = await self.collection.delete_many({"athlete_id": athlete_id})
        return result.deleted_count

    async def populate_all_athletes(self):
        """
        Populate EWMA metrics for all athletes with GPS data.
        Runs recalculate_from_date for each athlete from their earliest GPS date.
        """
        athletes = await self.db.athletes.find({}).to_list(1000)
        total = len(athletes)
        populated = 0

        for athlete in athletes:
            athlete_id = str(athlete["_id"])
            coach_id = str(athlete.get("coach_id", ""))

            earliest = await self.db.gps_data.find_one(
                {"athlete_id": athlete_id},
                sort=[("date", 1)],
                projection={"date": 1, "_id": 0}
            )

            if earliest and earliest.get("date"):
                try:
                    await self.recalculate_from_date(
                        athlete_id=athlete_id,
                        coach_id=coach_id,
                        start_date=earliest["date"]
                    )
                    populated += 1
                except Exception as e:
                    logger.error(f"[LoadEngine] Failed to populate {athlete_id}: {e}")

        logger.info(f"[LoadEngine] Population complete: {populated}/{total} athletes processed")


# Factory function
def create_load_engine(db: AsyncIOMotorDatabase) -> RollingLoadEngine:
    """Create a new RollingLoadEngine instance."""
    return RollingLoadEngine(db)
