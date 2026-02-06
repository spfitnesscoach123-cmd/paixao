// Parser for Catapult CSV format - Updated for real Catapult structure
export interface CatapultGPSData {
  player_name?: string; // Nome do jogador do CSV
  date: string;
  period_name?: string; // Session, 1ST HALF, 2ND HALF, W-UP
  total_distance: number;
  high_intensity_distance: number; // HID 14.4-19.8 km/h
  high_speed_running: number; // HSR 19.8-25.2 km/h
  sprint_distance: number; // 25.3+ km/h
  number_of_sprints: number;
  number_of_accelerations: number;
  number_of_decelerations: number;
  max_speed?: number;
  max_acceleration?: number;
  max_deceleration?: number;
}

interface CatapultMetadata {
  date?: string;
  startTime?: string;
  duration?: string;
  numPlayers?: number;
  numPeriods?: number;
}

export const parseCatapultCSV = (csvContent: string): { data: CatapultGPSData[], metadata: CatapultMetadata } => {
  const lines = csvContent.trim().split('\n');
  
  if (lines.length < 2) {
    throw new Error('CSV file is empty or invalid');
  }

  const metadata: CatapultMetadata = {};
  let headerLineIndex = -1;

  // Parse metadata (first few lines before headers)
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].trim();
    
    // Check if this is the header line (contains "Player Name")
    if (line.includes('Player Name') || line.includes('"Player Name"')) {
      headerLineIndex = i;
      break;
    }

    // Parse metadata lines
    if (line.includes('Date:')) {
      const dateMatch = line.match(/Date:[\s"]*([^,"]+)/);
      if (dateMatch) {
        metadata.date = parseCatapultDate(dateMatch[1].trim());
      }
    }
    if (line.includes('Start Time:')) {
      const timeMatch = line.match(/Start Time:[\s"]*([^,"]+)/);
      if (timeMatch) metadata.startTime = timeMatch[1].trim();
    }
    if (line.includes('Duration:')) {
      const durationMatch = line.match(/Duration:[\s"]*([^,"]+)/);
      if (durationMatch) metadata.duration = durationMatch[1].trim();
    }
    if (line.includes('Num Players:')) {
      const playersMatch = line.match(/Num Players:[\s"]*(\d+)/);
      if (playersMatch) metadata.numPlayers = parseInt(playersMatch[1]);
    }
    if (line.includes('Num Periods:')) {
      const periodsMatch = line.match(/Num Periods:[\s"]*(\d+)/);
      if (periodsMatch) metadata.numPeriods = parseInt(periodsMatch[1]);
    }
  }

  if (headerLineIndex === -1) {
    throw new Error('Could not find header row in CSV');
  }

  // Parse headers
  const headerLine = lines[headerLineIndex];
  const headers = parseCSVLine(headerLine);

  // Find column indices with exact Catapult naming
  const columnMap = {
    playerName: findColumnIndex(headers, ['player name']),
    periodName: findColumnIndex(headers, ['period name']),
    totalDistance: findColumnIndex(headers, ['average distance (session)', 'total distance']),
    hid: findColumnIndex(headers, ['hid average distance', 'high intensity distance']),
    hsr: findColumnIndex(headers, ['hsr average distance', 'high speed running']),
    sprintDistance: findColumnIndex(headers, ['sprint average distance 25', 'sprint distance']),
    numSprints: findColumnIndex(headers, ['sprint total # efforts', 'sprint total', 'number of sprints']),
    accelEfforts: findColumnIndex(headers, ['acceleration b1-3 average efforts']),
    decelEfforts: findColumnIndex(headers, ['deceleration b1-3 average efforts']),
    maxSpeed: findColumnIndex(headers, ['maximum velocity km/h', 'max velocity', 'maximum velocity']),
    maxAccel: findColumnIndex(headers, ['max acceleration']),
    maxDecel: findColumnIndex(headers, ['max deceleration']),
  };

  const data: CatapultGPSData[] = [];

  // Parse data rows (skip metadata and header)
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === ',') continue; // Skip empty lines

    try {
      const values = parseCSVLine(line);
      if (values.length < 10) continue; // Skip incomplete rows

      // Only process "Session" periods or aggregate if no period specified
      const periodName = columnMap.periodName !== -1 ? values[columnMap.periodName]?.trim() : '';
      
      // Skip warm-up periods, only include Session, 1ST HALF, 2ND HALF
      if (periodName && periodName.toUpperCase() === 'W-UP') {
        continue;
      }

      const record: CatapultGPSData = {
        date: metadata.date || new Date().toISOString().split('T')[0],
        period_name: periodName || undefined,
        total_distance: parseFloat(values[columnMap.totalDistance] || '0') || 0,
        high_intensity_distance: parseFloat(values[columnMap.hid] || '0') || 0,
        high_speed_running: parseFloat(values[columnMap.hsr] || '0') || 0,
        sprint_distance: parseFloat(values[columnMap.sprintDistance] || '0') || 0,
        number_of_sprints: parseInt(values[columnMap.numSprints] || '0') || 0,
        number_of_accelerations: parseInt(values[columnMap.accelEfforts] || '0') || 0,
        number_of_decelerations: parseInt(values[columnMap.decelEfforts] || '0') || 0,
        max_speed: columnMap.maxSpeed !== -1 ? parseFloat(values[columnMap.maxSpeed]) : undefined,
        max_acceleration: columnMap.maxAccel !== -1 ? parseFloat(values[columnMap.maxAccel]) : undefined,
        max_deceleration: columnMap.maxDecel !== -1 ? parseFloat(values[columnMap.maxDecel]) : undefined,
      };

      // Only add if there's meaningful data
      if (record.total_distance > 0 || record.number_of_sprints > 0) {
        data.push(record);
      }
    } catch (error) {
      console.warn(`Error parsing line ${i + 1}:`, error);
    }
  }

  return { data, metadata };
};

// Helper to parse CSV line handling quoted fields
const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
};

const findColumnIndex = (headers: string[], possibleNames: string[]): number => {
  for (const name of possibleNames) {
    const index = headers.findIndex(h => 
      h.toLowerCase().replace(/"/g, '').includes(name.toLowerCase())
    );
    if (index !== -1) return index;
  }
  return -1;
};

const parseCatapultDate = (dateStr: string): string => {
  // Catapult uses DD/MM/YYYY format
  try {
    const cleanDate = dateStr.replace(/"/g, '').trim();
    const parts = cleanDate.split('/');
    
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`; // Convert to YYYY-MM-DD
    }
  } catch (error) {
    console.warn('Error parsing date:', error);
  }
  
  return new Date().toISOString().split('T')[0];
};

export const validateCatapultCSV = (csvContent: string): { valid: boolean; error?: string } => {
  try {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      return { valid: false, error: 'Arquivo CSV vazio ou inválido' };
    }

    // Look for Catapult-specific indicators
    const fullContent = csvContent.toLowerCase();
    const hasCatapultIndicators = 
      fullContent.includes('player name') ||
      fullContent.includes('average distance') ||
      fullContent.includes('hsr') ||
      fullContent.includes('sprint') ||
      fullContent.includes('catapult');

    if (!hasCatapultIndicators) {
      return { 
        valid: false, 
        error: 'Arquivo não parece ser do formato Catapult. Certifique-se de exportar o relatório correto.' 
      };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Erro ao processar arquivo CSV' };
  }
};

export const aggregatePeriods = (records: CatapultGPSData[]): CatapultGPSData => {
  // Aggregate all periods into a single session record
  if (records.length === 0) {
    throw new Error('No records to aggregate');
  }

  const aggregated: CatapultGPSData = {
    date: records[0].date,
    period_name: 'Session',
    total_distance: 0,
    high_intensity_distance: 0,
    high_speed_running: 0,
    sprint_distance: 0,
    number_of_sprints: 0,
    number_of_accelerations: 0,
    number_of_decelerations: 0,
    max_speed: 0,
    max_acceleration: 0,
    max_deceleration: 0,
  };

  records.forEach(record => {
    aggregated.total_distance += record.total_distance;
    aggregated.high_intensity_distance += record.high_intensity_distance;
    aggregated.high_speed_running += record.high_speed_running;
    aggregated.sprint_distance += record.sprint_distance;
    aggregated.number_of_sprints += record.number_of_sprints;
    aggregated.number_of_accelerations += record.number_of_accelerations;
    aggregated.number_of_decelerations += record.number_of_decelerations;
    
    if (record.max_speed && record.max_speed > (aggregated.max_speed || 0)) {
      aggregated.max_speed = record.max_speed;
    }
    if (record.max_acceleration && record.max_acceleration > (aggregated.max_acceleration || 0)) {
      aggregated.max_acceleration = record.max_acceleration;
    }
    if (record.max_deceleration && record.max_deceleration < (aggregated.max_deceleration || 0)) {
      aggregated.max_deceleration = record.max_deceleration;
    }
  });

  return aggregated;
};
