// Parser for Catapult CSV format
export interface CatapultGPSData {
  date: string;
  total_distance: number;
  high_intensity_distance: number;
  sprint_distance: number;
  number_of_sprints: number;
  number_of_accelerations: number;
  number_of_decelerations: number;
  max_speed?: number;
}

export const parseCatapultCSV = (csvContent: string): CatapultGPSData[] => {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file is empty or invalid');
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const data: CatapultGPSData[] = [];

  // Find column indices (flexible to handle different CSV formats)
  const findColumnIndex = (possibleNames: string[]) => {
    for (const name of possibleNames) {
      const index = headers.findIndex(h => h.includes(name));
      if (index !== -1) return index;
    }
    return -1;
  };

  const dateIdx = findColumnIndex(['date', 'data', 'day']);
  const totalDistIdx = findColumnIndex(['total distance', 'total_distance', 'distance']);
  const hiDistIdx = findColumnIndex(['high intensity', 'hi distance', 'high_speed']);
  const sprintDistIdx = findColumnIndex(['sprint distance', 'sprint_distance', 'sprinting']);
  const sprintsIdx = findColumnIndex(['number of sprints', 'sprint count', 'sprints', 'n sprints']);
  const accelIdx = findColumnIndex(['acceleration', 'accel', 'accelerations']);
  const decelIdx = findColumnIndex(['deceleration', 'decel', 'decelerations']);
  const maxSpeedIdx = findColumnIndex(['max speed', 'maximum speed', 'top speed', 'vmax']);

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 2) continue; // Skip empty lines

    try {
      const record: CatapultGPSData = {
        date: dateIdx !== -1 ? formatDate(values[dateIdx]) : new Date().toISOString().split('T')[0],
        total_distance: totalDistIdx !== -1 ? parseFloat(values[totalDistIdx]) || 0 : 0,
        high_intensity_distance: hiDistIdx !== -1 ? parseFloat(values[hiDistIdx]) || 0 : 0,
        sprint_distance: sprintDistIdx !== -1 ? parseFloat(values[sprintDistIdx]) || 0 : 0,
        number_of_sprints: sprintsIdx !== -1 ? parseInt(values[sprintsIdx]) || 0 : 0,
        number_of_accelerations: accelIdx !== -1 ? parseInt(values[accelIdx]) || 0 : 0,
        number_of_decelerations: decelIdx !== -1 ? parseInt(values[decelIdx]) || 0 : 0,
        max_speed: maxSpeedIdx !== -1 ? parseFloat(values[maxSpeedIdx]) : undefined,
      };

      data.push(record);
    } catch (error) {
      console.warn(`Error parsing line ${i + 1}:`, error);
    }
  }

  return data;
};

const formatDate = (dateStr: string): string => {
  // Try to parse different date formats and convert to YYYY-MM-DD
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return new Date().toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

export const validateCatapultCSV = (csvContent: string): { valid: boolean; error?: string } => {
  try {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      return { valid: false, error: 'Arquivo CSV vazio ou inválido' };
    }

    const headers = lines[0].toLowerCase();
    const requiredFields = ['distance', 'sprint'];
    const hasRequiredFields = requiredFields.some(field => headers.includes(field));

    if (!hasRequiredFields) {
      return { 
        valid: false, 
        error: 'CSV não parece ser do formato Catapult. Certifique-se de que contém colunas de distância e sprints.' 
      };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Erro ao processar arquivo CSV' };
  }
};
