"""
Tests for peak value calculation logic.

The system must:
1. Use only the TOTAL SESSION value from each CSV (ignoring sub-periods like 1st half, 2nd half)
2. For each athlete, find the MAXIMUM value per metric across all GAME sessions
3. Store these peak values for use in daily/weekly prescription calculations
"""

import pytest
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from bson import ObjectId
import sys
sys.path.insert(0, '/app/backend')

from server import extract_gps_metrics_from_session

# Load environment
load_dotenv('/app/backend/.env')


class TestExtractGpsMetrics:
    """Test the extract_gps_metrics_from_session function"""
    
    def test_empty_records(self):
        """Should return zeros for empty records"""
        result = extract_gps_metrics_from_session([])
        assert result['total_distance'] == 0
        assert result['hid_z3'] == 0
        assert result['hsr_z4'] == 0
    
    def test_single_consolidated_record(self):
        """Should use consolidated record directly when has_session_total flag is present"""
        records = [{
            'has_session_total': True,
            'total_distance': 10000,
            'high_intensity_distance': 2000,
            'high_speed_running': 1500,
            'sprint_distance': 500,
            'number_of_sprints': 20,
            'number_of_accelerations': 30,
            'number_of_decelerations': 25
        }]
        result = extract_gps_metrics_from_session(records)
        assert result['total_distance'] == 10000
        assert result['hid_z3'] == 2000
        assert result['hsr_z4'] == 1500
        assert result['sprint_z5'] == 500
        assert result['sprints_count'] == 20
        assert result['acc_dec_total'] == 55  # 30 + 25
    
    def test_session_with_periods(self):
        """Should use SESSION record, NOT sum of period records"""
        records = [
            {
                'period_name': 'Session',
                'total_distance': 10000,
                'high_intensity_distance': 2000,
                'high_speed_running': 1500,
                'sprint_distance': 500,
                'number_of_sprints': 20,
                'number_of_accelerations': 30,
                'number_of_decelerations': 25
            },
            {
                'period_name': '1ST HALF',
                'total_distance': 5000,
                'high_intensity_distance': 1000,
                'high_speed_running': 750,
                'sprint_distance': 250,
                'number_of_sprints': 10,
                'number_of_accelerations': 15,
                'number_of_decelerations': 12
            },
            {
                'period_name': '2ND HALF',
                'total_distance': 5000,
                'high_intensity_distance': 1000,
                'high_speed_running': 750,
                'sprint_distance': 250,
                'number_of_sprints': 10,
                'number_of_accelerations': 15,
                'number_of_decelerations': 13
            }
        ]
        result = extract_gps_metrics_from_session(records)
        # Should use Session value (10000), NOT sum of halves (5000 + 5000 = 10000)
        # In this case they're equal, but the logic matters
        assert result['total_distance'] == 10000
        assert result['hid_z3'] == 2000
    
    def test_session_with_periods_different_values(self):
        """Critical test: Session total should be used, not sum of periods"""
        records = [
            {
                'period_name': 'Session',
                'total_distance': 12000,  # This should be used
                'high_intensity_distance': 2500,
                'high_speed_running': 0,
                'sprint_distance': 0,
                'number_of_sprints': 0,
                'number_of_accelerations': 0,
                'number_of_decelerations': 0
            },
            {
                'period_name': '1ST HALF',
                'total_distance': 5000,  # Sum would be 11000, NOT 12000
                'high_intensity_distance': 1000,
                'high_speed_running': 0,
                'sprint_distance': 0,
                'number_of_sprints': 0,
                'number_of_accelerations': 0,
                'number_of_decelerations': 0
            },
            {
                'period_name': '2ND HALF',
                'total_distance': 6000,
                'high_intensity_distance': 1200,
                'high_speed_running': 0,
                'sprint_distance': 0,
                'number_of_sprints': 0,
                'number_of_accelerations': 0,
                'number_of_decelerations': 0
            }
        ]
        result = extract_gps_metrics_from_session(records)
        # MUST be 12000 (session), NOT 11000 (sum of periods)
        assert result['total_distance'] == 12000, f"Expected 12000, got {result['total_distance']}"
        assert result['hid_z3'] == 2500, f"Expected 2500, got {result['hid_z3']}"
    
    def test_only_periods_no_session(self):
        """When no session record exists, sum the period records"""
        records = [
            {
                'period_name': '1ST HALF',
                'total_distance': 5000,
                'high_intensity_distance': 1000,
                'high_speed_running': 0,
                'sprint_distance': 0,
                'number_of_sprints': 0,
                'number_of_accelerations': 0,
                'number_of_decelerations': 0
            },
            {
                'period_name': '2ND HALF',
                'total_distance': 5500,
                'high_intensity_distance': 1100,
                'high_speed_running': 0,
                'sprint_distance': 0,
                'number_of_sprints': 0,
                'number_of_accelerations': 0,
                'number_of_decelerations': 0
            }
        ]
        result = extract_gps_metrics_from_session(records)
        # No session record, so sum periods
        assert result['total_distance'] == 10500
        assert result['hid_z3'] == 2100
    
    def test_session_keywords_variations(self):
        """Test various session keywords are recognized"""
        for keyword in ['Session', 'session', 'TOTAL SESSION', 'Total', 'Full Match', 'Complete', 'Summary', 'Sessão']:
            records = [
                {
                    'period_name': keyword,
                    'total_distance': 8000,
                    'high_intensity_distance': 0,
                    'high_speed_running': 0,
                    'sprint_distance': 0,
                    'number_of_sprints': 0,
                    'number_of_accelerations': 0,
                    'number_of_decelerations': 0
                },
                {
                    'period_name': '1st Half',
                    'total_distance': 4000,
                    'high_intensity_distance': 0,
                    'high_speed_running': 0,
                    'sprint_distance': 0,
                    'number_of_sprints': 0,
                    'number_of_accelerations': 0,
                    'number_of_decelerations': 0
                }
            ]
            result = extract_gps_metrics_from_session(records)
            assert result['total_distance'] == 8000, f"Failed for keyword: {keyword}"
    
    def test_period_keywords_excluded(self):
        """Test that period keywords are properly excluded from session total"""
        # "Total 1st Half" should NOT be treated as session total
        records = [
            {
                'period_name': 'Total 1st Half',  # Contains both "Total" and "1st", should be period
                'total_distance': 5000,
                'high_intensity_distance': 0,
                'high_speed_running': 0,
                'sprint_distance': 0,
                'number_of_sprints': 0,
                'number_of_accelerations': 0,
                'number_of_decelerations': 0
            },
            {
                'period_name': 'Total 2nd Half',
                'total_distance': 5500,
                'high_intensity_distance': 0,
                'high_speed_running': 0,
                'sprint_distance': 0,
                'number_of_sprints': 0,
                'number_of_accelerations': 0,
                'number_of_decelerations': 0
            }
        ]
        result = extract_gps_metrics_from_session(records)
        # No clear session total, so these should be summed as periods
        assert result['total_distance'] == 10500


class TestPeakValuesIntegration:
    """Integration tests for peak values calculation"""
    
    @pytest.fixture
    def db(self):
        """Get database connection"""
        client = AsyncIOMotorClient(os.environ['MONGO_URL'])
        return client[os.environ['DB_NAME']]
    
    @pytest.mark.asyncio
    async def test_peak_values_stored_correctly(self, db):
        """Verify peak values in database match expected calculations"""
        # Get Paixao coach
        coach = await db.users.find_one({'email': 'silasf@ymail.com'})
        if not coach:
            pytest.skip("Test coach not found")
        
        coach_id = str(coach['_id'])
        
        # Get all athletes with peak values
        peaks = await db.athlete_peak_values.find({'coach_id': coach_id}).to_list(100)
        assert len(peaks) > 0, "No peak values found"
        
        # Verify each peak matches the actual max from game sessions
        for peak in peaks[:5]:  # Check first 5
            athlete_id = peak['athlete_id']
            stored_distance = peak.get('total_distance', 0)
            
            # Get all game sessions for this athlete
            games = await db.gps_data.find({
                'coach_id': coach_id,
                'athlete_id': athlete_id,
                'activity_type': 'game'
            }).to_list(1000)
            
            # Group by session_id
            sessions = {}
            for g in games:
                sid = g.get('session_id', '')
                if sid not in sessions:
                    sessions[sid] = []
                sessions[sid].append(g)
            
            # Calculate expected max using session total logic
            max_dist = 0
            for sid, records in sessions.items():
                metrics = extract_gps_metrics_from_session(records)
                if metrics['total_distance'] > max_dist:
                    max_dist = metrics['total_distance']
            
            assert abs(stored_distance - max_dist) < 1, \
                f"Peak mismatch for {athlete_id}: stored={stored_distance}, calculated={max_dist}"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
