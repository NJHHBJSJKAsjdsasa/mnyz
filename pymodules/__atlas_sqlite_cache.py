# pymodules/__atlas_sqlite_cache.py

import os
import sqlite3
import json
from contextlib import contextmanager
from typing import Optional, Dict, Any

class SQLiteCacheManager:
    def __init__(self):
        self.db_path = "internal_data/cache/atlas_cache.db"
        
        # Create cache directory if it doesn't exist
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        # Initialize database
        self._init_db()

    @contextmanager
    def _connection(self):
        """Open a connection and always close it (sqlite3's `with` only commits)."""
        conn = sqlite3.connect(self.db_path)
        try:
            yield conn
        finally:
            conn.close()
    
    def _init_db(self):
        """Initialize the SQLite database"""
        with self._connection() as conn:
            cursor = conn.cursor()
            
            # Create galaxies table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS galaxies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    x INTEGER NOT NULL,
                    y INTEGER NOT NULL,
                    z INTEGER NOT NULL,
                    data TEXT NOT NULL,
                    UNIQUE(x, y, z)
                )
            ''')
            
            # Create systems table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS systems (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    x INTEGER NOT NULL,
                    y INTEGER NOT NULL,
                    z INTEGER NOT NULL,
                    system_index INTEGER NOT NULL,
                    data TEXT NOT NULL,
                    UNIQUE(x, y, z, system_index)
                )
            ''')
            
            # Create planets table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS planets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    x INTEGER NOT NULL,
                    y INTEGER NOT NULL,
                    z INTEGER NOT NULL,
                    system_index INTEGER NOT NULL,
                    planet_name TEXT NOT NULL,
                    data TEXT NOT NULL,
                    UNIQUE(x, y, z, system_index, planet_name)
                )
            ''')
            
            # Create indexes for faster lookup
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_galaxies_coords ON galaxies(x, y, z)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_systems_coords ON systems(x, y, z, system_index)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_planets_coords ON planets(x, y, z, system_index, planet_name)')
            
            conn.commit()
    
    def save_galaxy(self, x: int, y: int, z: int, galaxy_data: Dict[str, Any]) -> bool:
        """Save galaxy data to SQLite cache"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()
                data_json = json.dumps(galaxy_data)
                
                # Insert or replace
                cursor.execute('''
                    INSERT OR REPLACE INTO galaxies (x, y, z, data) 
                    VALUES (?, ?, ?, ?)
                ''', (x, y, z, data_json))
                
                conn.commit()
            return True
        except Exception as e:
            print(f"Error saving galaxy to SQLite cache: {e}")
            return False
    
    def get_galaxy(self, x: int, y: int, z: int) -> Optional[Dict[str, Any]]:
        """Get galaxy data from SQLite cache"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute('''
                    SELECT data FROM galaxies WHERE x = ? AND y = ? AND z = ?
                ''', (x, y, z))
                
                result = cursor.fetchone()
                if result:
                    return json.loads(result[0])
                return None
        except Exception as e:
            print(f"Error reading galaxy from SQLite cache: {e}")
            return None
    
    def save_system(self, x: int, y: int, z: int, system_index: int, system_data: Dict[str, Any]) -> bool:
        """Save system data to SQLite cache"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()
                data_json = json.dumps(system_data)
                
                # Insert or replace
                cursor.execute('''
                    INSERT OR REPLACE INTO systems (x, y, z, system_index, data) 
                    VALUES (?, ?, ?, ?, ?)
                ''', (x, y, z, system_index, data_json))
                
                conn.commit()
            return True
        except Exception as e:
            print(f"Error saving system to SQLite cache: {e}")
            return False
    
    def get_system(self, x: int, y: int, z: int, system_index: int) -> Optional[Dict[str, Any]]:
        """Get system data from SQLite cache"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute('''
                    SELECT data FROM systems WHERE x = ? AND y = ? AND z = ? AND system_index = ?
                ''', (x, y, z, system_index))
                
                result = cursor.fetchone()
                if result:
                    return json.loads(result[0])
                return None
        except Exception as e:
            print(f"Error reading system from SQLite cache: {e}")
            return None
    
    def save_planet(self, x: int, y: int, z: int, system_index: int, planet_name: str, planet_data: Dict[str, Any]) -> bool:
        """Save planet data to SQLite cache"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()
                data_json = json.dumps(planet_data)
                
                # Insert or replace
                cursor.execute('''
                    INSERT OR REPLACE INTO planets (x, y, z, system_index, planet_name, data) 
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (x, y, z, system_index, planet_name, data_json))
                
                conn.commit()
            return True
        except Exception as e:
            print(f"Error saving planet to SQLite cache: {e}")
            return False
    
    def get_planet(self, x: int, y: int, z: int, system_index: int, planet_name: str) -> Optional[Dict[str, Any]]:
        """Get planet data from SQLite cache"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute('''
                    SELECT data FROM planets WHERE x = ? AND y = ? AND z = ? AND system_index = ? AND planet_name = ?
                ''', (x, y, z, system_index, planet_name))
                
                result = cursor.fetchone()
                if result:
                    return json.loads(result[0])
                return None
        except Exception as e:
            print(f"Error reading planet from SQLite cache: {e}")
            return None
    
    def galaxy_exists(self, x: int, y: int, z: int) -> bool:
        """Check if galaxy exists in cache"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute('''
                    SELECT COUNT(*) FROM galaxies WHERE x = ? AND y = ? AND z = ?
                ''', (x, y, z))
                
                result = cursor.fetchone()
                return result[0] > 0
        except Exception as e:
            print(f"Error checking galaxy existence: {e}")
            return False
    
    def system_exists(self, x: int, y: int, z: int, system_index: int) -> bool:
        """Check if system exists in cache"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute('''
                    SELECT COUNT(*) FROM systems WHERE x = ? AND y = ? AND z = ? AND system_index = ?
                ''', (x, y, z, system_index))
                
                result = cursor.fetchone()
                return result[0] > 0
        except Exception as e:
            print(f"Error checking system existence: {e}")
            return False
    
    def planet_exists(self, x: int, y: int, z: int, system_index: int, planet_name: str) -> bool:
        """Check if planet exists in cache"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute('''
                    SELECT COUNT(*) FROM planets WHERE x = ? AND y = ? AND z = ? AND system_index = ? AND planet_name = ?
                ''', (x, y, z, system_index, planet_name))
                
                result = cursor.fetchone()
                return result[0] > 0
        except Exception as e:
            print(f"Error checking planet existence: {e}")
            return False
    
    def get_cache_stats(self) -> Dict[str, int]:
        """Get cache statistics"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()
                
                # Get galaxy count
                cursor.execute('SELECT COUNT(*) FROM galaxies')
                galaxy_count = cursor.fetchone()[0]
                
                # Get system count
                cursor.execute('SELECT COUNT(*) FROM systems')
                system_count = cursor.fetchone()[0]
                
                # Get planet count
                cursor.execute('SELECT COUNT(*) FROM planets')
                planet_count = cursor.fetchone()[0]
                
                return {
                    'galaxies': galaxy_count,
                    'systems': system_count,
                    'planets': planet_count
                }
        except Exception as e:
            print(f"Error getting cache stats: {e}")
            return {'galaxies': 0, 'systems': 0, 'planets': 0}

# Create a global instance
sqlite_cache = SQLiteCacheManager()
