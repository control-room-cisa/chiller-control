import React, { useState, useEffect } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// Configurar dayjs para usar UTC y timezone
dayjs.extend(utc);
dayjs.extend(timezone);

// Establecer la zona horaria por defecto
dayjs.tz.setDefault('America/Tegucigalpa');

const API_BASE = 'http://tegus.arrayanhn.com:3001';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

const opciones = [
  { value: 'chiller_aire_minutos', label: 'Chiller Aire Minutos' },
  { value: 'chiller_aire_segundos', label: 'Chiller Aire Segundos' },
  { value: 'chiller_agua_minutos', label: 'Chiller Agua Minutos' },
  { value: 'chiller_agua_segundos', label: 'Chiller Agua Segundos' },

  // ✅ NUEVAS (enfriado)
  { value: 'chiller_enfriado_aire_segundos', label: 'Chiller Enfriado Aire (Segundos)' },
  { value: 'chiller_enfriado_agua_segundos', label: 'Chiller Enfriado Agua (Segundos)' },

  { value: 'ion_meter_minutos', label: 'Medidor Ion' },
  { value: 'resumen_bitacora', label: 'Resumen Bitácora' },
];

const ITEMS_PER_PAGE = 10;

export default function DataLogger() {
  const [selectedOption, setSelectedOption] = useState(opciones[0].value);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dateFilter, setDateFilter] = useState('');
  const [exporting, setExporting] = useState(false);

  // Tiempo de encendido
  const [sensorUptime, setSensorUptime] = useState({
    air: { hours: 0, minutes: 0, seconds: 0 },
    pump: { hours: 0, minutes: 0, seconds: 0 },
    water: { hours: 0, minutes: 0, seconds: 0 }
  });

  // Promedios temperatura
  const [temperatureAverages, setTemperatureAverages] = useState({
    avg_temp_entrada: null,
    avg_temp_salida: null,
    avg_temp_cisterna2: null,
    total_records: 0,
    date: null,
    table: null
  });

  // KWH IMP medianoche
  const [midnightKWH, setMidnightKWH] = useState(null);

  // Estados componentes
  const [componentStatus, setComponentStatus] = useState({
    compresor: 0,
    ventilador: 0,
    bomba_proceso: 0,
    bomba_condensador: 0,
    timestamp: null
  });

  // Resumen bitácora
  const [summaryData, setSummaryData] = useState({
    main_meter_kwh: null,
    hourmeter_water_chiller: null,
    hourmeter_air_chiller: null,
    temp_central_chilled_water_tank_top: "INSTALLATION IN PROCESS",
    temp_central_chilled_water_tank_bottom: "INSTALLATION IN PROCESS",
    water_level_city_water_tank: "INSTALLATION IN PROCESS",
    temp_city_water_tank: "INSTALLATION IN PROCESS",
    water_level_tank1: null,
    temp_tank1: "INSTALLATION IN PROCESS",
    water_level_tank2: null,
    temp_tank2: "INSTALLATION IN PROCESS",
    water_level_tank3: null,
    temp_tank3: "INSTALLATION IN PROCESS",
    cycles_water_chiller: null,
    cycles_air_chiller: null,
    date: null,
    next_day: null
  });

  const isMinutesTable = selectedOption.includes('minutos');

  const fetchData = async () => {
    if (!dateFilter) {
      setData([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const url = `/api/chiller/data/${selectedOption}?date=${dateFilter}`;
      const response = await api.get(url);

      const rawData = response.data?.data || [];
      const sanitizedData = rawData.map(row => {
        const newRow = {};
        for (const key in row) {
          if (Object.hasOwnProperty.call(row, key)) {
            const value = row[key];
            if (key !== 'fecha_hora' && value !== null && value !== undefined && value !== '' && !isNaN(value)) {
              newRow[key] = parseFloat(value);
            } else {
              newRow[key] = value;
            }
          }
        }
        return newRow;
      });

      setData(sanitizedData);
    } catch (err) {
      setError('Error al cargar los datos');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!dateFilter) return;

    setExporting(true);
    setError(null);
    try {
      const exportUrl = `/api/chiller/export/${selectedOption}?date=${dateFilter}`;
      const response = await api.get(exportUrl, { responseType: 'blob' });

      // Crear URL del blob y link para descarga
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `chiller_data_${selectedOption}_${dateFilter}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Error al exportar los datos');
      console.error('Error:', err);
    } finally {
      setExporting(false);
    }
  };

  const fetchSensorUptime = async () => {
    if (!dateFilter) return;

    try {
      const response = await api.get(`/api/chiller/uptime?date=${dateFilter}&table=${selectedOption}`);
      if (!response.data) return;

      const newUptime = {
        air: { hours: 0, minutes: 0, seconds: 0 },
        pump: { hours: 0, minutes: 0, seconds: 0 },
        water: { hours: 0, minutes: 0, seconds: 0 }
      };

      // ✅ ORIGINAL + NUEVAS TABLAS (enfriado)
      if (selectedOption === 'chiller_aire_segundos' || selectedOption === 'chiller_enfriado_aire_segundos') {
        const airSeconds = response.data.total_segundos_encendido_air || 0;
        newUptime.air = {
          hours: Math.floor(airSeconds / 3600),
          minutes: Math.floor((airSeconds % 3600) / 60),
          seconds: airSeconds % 60
        };

        const pumpSeconds = response.data.total_segundos_encendido_pump || 0;
        newUptime.pump = {
          hours: Math.floor(pumpSeconds / 3600),
          minutes: Math.floor((pumpSeconds % 3600) / 60),
          seconds: pumpSeconds % 60
        };
      } else if (selectedOption === 'chiller_agua_segundos' || selectedOption === 'chiller_enfriado_agua_segundos') {
        const waterSeconds = response.data.total_segundos_encendido_water || 0;
        newUptime.water = {
          hours: Math.floor(waterSeconds / 3600),
          minutes: Math.floor((waterSeconds % 3600) / 60),
          seconds: waterSeconds % 60
        };

        // ✅ NUEVO: para chiller_enfriado_agua_segundos también viene bomba (si tu endpoint la manda)
        if (selectedOption === 'chiller_enfriado_agua_segundos') {
          const pumpSeconds = response.data.total_segundos_encendido_pump || 0;
          newUptime.pump = {
            hours: Math.floor(pumpSeconds / 3600),
            minutes: Math.floor((pumpSeconds % 3600) / 60),
            seconds: pumpSeconds % 60
          };
        }
      }

      setSensorUptime(newUptime);
    } catch (err) {
      console.error('Error al obtener tiempo de encendido:', err);
    }
  };

  const fetchTemperatureAverages = async () => {
    if (!dateFilter) return;

    try {
      const response = await api.get(`/api/chiller/temperature-averages/${selectedOption}?date=${dateFilter}`);
      if (response.data && response.data.success) {
        setTemperatureAverages(response.data.data);
      }
    } catch (err) {
      console.error('Error al obtener promedios de temperatura:', err);
      // Reset temperature averages on error
      setTemperatureAverages({
        avg_temp_entrada: null,
        avg_temp_salida: null,
        avg_temp_cisterna2: null,
        total_records: 0,
        date: null,
        table: null
      });
    }
  };

  const fetchEnergyAverages = async () => {
    if (!dateFilter) return;

    try {
      const response = await axios.get(
        `http://tegus.arrayanhn.com:3001/api/chiller/energy-averages/${selectedOption}?date=${dateFilter}`
      );

      if (response.data && response.data.success) {
        // Asegurar que todos los valores numéricos sean números válidos
        const data = response.data.data;
        console.log('Datos de energía recibidos del servidor:', data);

        const sanitizedData = {};

        Object.keys(data).forEach(key => {
          if (key === 'date' || key === 'table' || key === 'total_records') {
            sanitizedData[key] = data[key];
          } else {
            // Para valores numéricos, convertir a número y validar
            const numValue = parseFloat(data[key]);
            sanitizedData[key] = isNaN(numValue) ? null : numValue;
          }
        });

        console.log('Datos de energía sanitizados:', sanitizedData);
        // setEnergyAverages(sanitizedData); // This line is removed
      }
    } catch (err) {
      console.error('Error al obtener promedios de energía:', err);
      // Reset energy averages on error
      // setEnergyAverages({ // This line is removed
      //   avg_kwh_imp: null,
      //   avg_kwh_exp: null,
      //   avg_kwh_tot: null,
      //   avg_kwh_net: null,
      //   avg_kvarh_imp: null,
      //   avg_kvarh_exp: null,
      //   avg_kvarh_tot: null,
      //   avg_kvarh_net: null,
      //   avg_kvah_tot: null,
      //   avg_freq: null,
      //   avg_vln_avg: null,
      //   avg_ia: null,
      //   avg_ib: null,
      //   avg_pf: null,
      //   total_records: 0,
      //   date: null,
      //   table: null
      // });
    }
  };

  const fetchMidnightKWH = async () => {
    if (!dateFilter) {
      setMidnightKWH(null);
      return;
    }

    try {
      const response = await api.get(`/api/chiller/ion/midnight-kwh-imp?date=${dateFilter}`);
      if (response.data && response.data.success) setMidnightKWH(response.data.kwh_imp_midnight);
      else setMidnightKWH(null);
    } catch (err) {
      console.error('Error al obtener KWH IMP de medianoche:', err);
      setMidnightKWH(null);
    }
  };

  const fetchComponentStatus = async () => {
    try {
      const response = await api.get(`/api/chiller/component-status/${selectedOption}`);
      if (response.data && response.data.success) setComponentStatus(response.data.data);
    } catch (err) {
      console.error('Error al obtener estados de componentes:', err);
      // Reset component status on error
      setComponentStatus({
        compresor: 0,
        ventilador: 0,
        bomba_proceso: 0,
        bomba_condensador: 0,
        timestamp: null
      });
    }
  };

  const fetchSummaryData = async () => {
    if (!dateFilter) {
      setSummaryData({
        main_meter_kwh: null,
        hourmeter_water_chiller: null,
        hourmeter_air_chiller: null,
        temp_central_chilled_water_tank_top: "INSTALLATION IN PROCESS",
        temp_central_chilled_water_tank_bottom: "INSTALLATION IN PROCESS",
        water_level_city_water_tank: "INSTALLATION IN PROCESS",
        temp_city_water_tank: "INSTALLATION IN PROCESS",
        water_level_tank1: null,
        temp_tank1: "INSTALLATION IN PROCESS",
        water_level_tank2: null,
        temp_tank2: "INSTALLATION IN PROCESS",
        water_level_tank3: null,
        temp_tank3: "INSTALLATION IN PROCESS",
        cycles_water_chiller: null,
        cycles_air_chiller: null,
        date: null,
        next_day: null
      });
      return;
    }

    try {
      const response = await api.get(`/api/chiller/summary-bitacora?date=${dateFilter}`);
      if (response.data && response.data.success) setSummaryData(response.data.data);
    } catch (err) {
      console.error('Error al obtener datos del resumen bitácora:', err);
      setSummaryData({
        main_meter_kwh: null,
        hourmeter_water_chiller: null,
        hourmeter_air_chiller: null,
        temp_central_chilled_water_tank: null,
        water_level_tank2: null,
        temp_tank2: null,
        date: null
      });
    }
  };

  useEffect(() => {
    setError(null);

    if (selectedOption === 'resumen_bitacora') {
      fetchSummaryData();
      return;
    }

    fetchData();

    // ✅ ORIGINAL + NUEVAS TABLAS (enfriado) SOLO para uptime
    if (
      selectedOption === 'chiller_aire_segundos' ||
      selectedOption === 'chiller_agua_segundos' ||
      selectedOption === 'chiller_enfriado_aire_segundos' ||
      selectedOption === 'chiller_enfriado_agua_segundos'
    ) {
      fetchSensorUptime();
    }

    // (se deja EXACTAMENTE como estaba: component-status solo para legacy)
    if (selectedOption === 'chiller_aire_segundos' || selectedOption === 'chiller_agua_segundos') {
      fetchComponentStatus();
    }

    if (selectedOption === 'chiller_aire_minutos' || selectedOption === 'chiller_agua_minutos') {
      fetchTemperatureAverages();
    }

    if (selectedOption === 'ion_meter_minutos') {
      fetchMidnightKWH();
    }
  }, [selectedOption, dateFilter]);

  const formatDateTime = (dateStr) => {
    try {
      return dayjs(dateStr).format('DD/MM/YYYY HH:mm:ss');
    } catch (error) {
      console.error('Error al formatear fecha:', error);
      return dateStr;
    }
  };

  // Función para formatear el tiempo de encendido en el nuevo formato
  const formatUptimeDisplay = (uptimeObj) => {
    const totalSeconds = uptimeObj.hours * 3600 + uptimeObj.minutes * 60 + uptimeObj.seconds;
    const totalMinutes = totalSeconds / 60;
    const totalHours = totalSeconds / 3600;

    return {
      hours: totalHours.toFixed(3),
      minutes: totalMinutes.toFixed(2),
      seconds: totalSeconds,
      formatted: `${uptimeObj.hours}h ${uptimeObj.minutes}m ${uptimeObj.seconds}s`
    };
  };

  // Función para formatear valores de energía
  const formatEnergyValue = (value, unit = '') => {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';

    if (unit.startsWith('k')) {
      return `${value % 1 === 0 ? value : value.toFixed(3)} ${unit}`;
    }

    // Lógica original para convertir a kilo-unidades si es necesario
    if (Math.abs(value) >= 1000) {
      const k = value / 1000;
      return `${k % 1 === 0 ? k : k.toFixed(3)} k${unit}`;
    }
    return `${value} ${unit}`.trim();
  };

  // Función para formatear la fecha en formato DD/M/YYYY
  const formatDisplayDate = (dateStr) => {
    try {
      return dayjs(dateStr).format('D/M/YYYY');
    } catch (error) {
      console.error('Error al formatear fecha para mostrar:', error);
      return dateStr;
    }
  };

  // Función para obtener la fecha del día siguiente
  const getNextDayDate = (dateStr) => {
    try {
      return dayjs(dateStr).add(1, 'day').format('D/M/YYYY');
    } catch (error) {
      console.error('Error al calcular fecha del día siguiente:', error);
      return dateStr;
    }
  };

  const formatStatus = (status) => (status === 1 ? 'ON' : 'OFF');

  const formatHeaderText = (text) => {
    // Reemplazar guiones bajos con espacios y convertir a mayúsculas
    const words = text.replace(/_/g, ' ').toUpperCase().split(' ');

    if (words.length <= 2) return words.join(' ');

    const midPoint = Math.ceil(words.length / 2);
    const firstLine = words.slice(0, midPoint).join(' ');
    const secondLine = words.slice(midPoint).join(' ');

    return (
      <>
        <div>{firstLine}</div>
        <div>{secondLine}</div>
      </>
    );
  };

  const formatIonHeaderText = (text) => {
    const headerMappings = {
      // 'meter_id': 'ID MEDIDOR',
      'fecha_hora': 'FECHA HORA',
      'kwh_imp': 'KWH IMP',
      'kwh_exp': 'KWH EXP',
      'kwh_tot': 'KWH TOTAL',
      'kwh_net': 'KWH NETO',
      'kvarh_imp': 'KVARH IMP',
      'kvarh_exp': 'KVARH EXP',
      'kvarh_tot': 'KVARH TOTAL',
      'kvarh_net': 'KVARH NETO',
      'kvah_tot': 'KVAH TOTAL',
      'freq': 'FRECUENCIA',
      'vln_a': 'VLN A',
      'vln_b': 'VLN B',
      'vln_avg': 'VLN PROM',
      'ia': 'CORRIENTE A',
      'ib': 'CORRIENTE B',
      'pf': 'FACTOR POT'
    };

    return headerMappings[text] || text.replace(/_/g, ' ').toUpperCase();
  };

  const renderTableHeaders = () => {
    if (data.length === 0) return null;

    const headers = Object.keys(data[0]).filter(
      key => key !== 'id' && key !== 'chiller_id' && (selectedOption === 'ion_meter_minutos' ? key !== 'meter_id' : true)
    );

    return (
      <tr>
        {headers.map(header => (
          <th
            key={header}
            className="px-6 py-2 text-center sticky top-0 bg-gradient-to-b from-blue-600 to-blue-700 text-white font-semibold text-xs uppercase tracking-wider"
          >
            {selectedOption === 'ion_meter_minutos'
              ? header.toUpperCase().replace(/_/g, ' ')
              : formatHeaderText(header)}
          </th>
        ))}
      </tr>
    );
  };

  const renderTableRows = () => {
    return data.map((row, index) => {
      const rowKey = row.id ?? row.fecha_hora ?? index;

      return (
        <tr
          key={rowKey}
          className={`
            border-b border-gray-200 hover:bg-blue-50 transition-colors
            ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
          `}
        >
          {Object.entries(row).map(([key, value]) => {
            if (key === 'id' || key === 'chiller_id' || (selectedOption === 'ion_meter_minutos' && key === 'meter_id')) return null;

            const isNumeric = key !== 'fecha_hora' && !isNaN(value);

            let displayValue = value;
            if (selectedOption === 'ion_meter_minutos' && isNumeric) {
              if (key.startsWith('kwh_')) displayValue = formatEnergyValue(value, 'kWh');
              else if (key.startsWith('kvarh_')) displayValue = formatEnergyValue(value, 'kVarh');
              else if (key.startsWith('kvah_')) displayValue = formatEnergyValue(value, 'kVAh');
              else if (key === 'freq') displayValue = value != null ? `${Number(value).toFixed(2)} Hz` : 'N/A';
              else if (key.startsWith('vln_')) displayValue = value != null ? `${Number(value).toFixed(2)} V` : 'N/A';
              else if (key.startsWith('i')) displayValue = value != null ? `${Number(value).toFixed(2)} A` : 'N/A';
              else if (key === 'pf') displayValue = value != null ? Number(value).toFixed(3) : 'N/A';
            }

            return (
              <td
                key={key}
                className={`px-6 py-2 whitespace-nowrap ${isNumeric ? 'text-center font-mono text-gray-700' : 'text-center text-gray-800'
                  }`}
              >
                {key === 'fecha_hora' ? formatDateTime(value) : displayValue}
              </td>
            );
          })}
        </tr>
      );
    });
  };

  return (
    <div className="w-screen h-screen bg-gray-100 flex flex-col">
      <div className="bg-white shadow-lg rounded-lg m-2 flex-1 flex flex-col overflow-hidden">
        {/* Controles superiores */}
        <div className="flex flex-wrap gap-4 p-4 bg-white border-b">
          {/* Selector de base de datos */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Base de datos:
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedOption}
              onChange={e => setSelectedOption(e.target.value)}
            >
              {opciones.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Filtro de fecha */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Seleccionar fecha:
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
            />
          </div>

          {/* Botones */}
          <div className="flex items-end gap-2">
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading || !dateFilter || selectedOption === 'resumen_bitacora'}
            >
              {loading ? 'Cargando...' : 'Actualizar'}
            </button>

            <button
              onClick={handleExport}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-400"
              disabled={exporting || !dateFilter || data.length === 0 || selectedOption === 'resumen_bitacora'}
            >
              {exporting ? 'Exportando...' : 'Exportar Excel'}
            </button>
          </div>
        </div>

        {/* Tiempo de encendido */}
        {(selectedOption === 'chiller_aire_segundos' ||
          selectedOption === 'chiller_agua_segundos' ||
          selectedOption === 'chiller_enfriado_aire_segundos' ||
          selectedOption === 'chiller_enfriado_agua_segundos') && dateFilter && (
            <div className="p-6 bg-gradient-to-r from-blue-50 to-green-50 border-b">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Tiempo de Encendido</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(selectedOption === 'chiller_aire_segundos' || selectedOption === 'chiller_enfriado_aire_segundos') ? (
                  <>
                    {/* Chiller enfriado por aire */}
                    <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-blue-500">
                      <h4 className="text-lg font-semibold text-blue-700 mb-3">Chiller enfriado por aire</h4>
                      <div className="space-y-2">
                        <div className="text-sm text-gray-600">Tiempo encendido:</div>
                        <div className="space-y-1">
                          <div className="text-lg font-bold text-blue-600">
                            {formatUptimeDisplay(sensorUptime.air).hours} Horas
                          </div>
                          <div className="text-md font-semibold text-blue-500">
                            {formatUptimeDisplay(sensorUptime.air).minutes} minutos
                          </div>
                          <div className="text-sm font-medium text-blue-400">
                            {formatUptimeDisplay(sensorUptime.air).seconds} segundos
                          </div>
                          <div className="text-xs text-gray-500 mt-2">
                            ({formatUptimeDisplay(sensorUptime.air).formatted})
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Horómetro bomba de proceso */}
                    <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-green-500">
                      <h4 className="text-lg font-semibold text-green-700 mb-3">Bomba de proceso (STATUS VDF)</h4>
                      <div className="space-y-2">
                        <div className="text-sm text-gray-600">Tiempo encendido:</div>
                        <div className="space-y-1">
                          <div className="text-lg font-bold text-green-600">
                            {formatUptimeDisplay(sensorUptime.pump).hours} Horas
                          </div>
                          <div className="text-md font-semibold text-green-500">
                            {formatUptimeDisplay(sensorUptime.pump).minutes} minutos
                          </div>
                          <div className="text-sm font-medium text-green-400">
                            {formatUptimeDisplay(sensorUptime.pump).seconds} segundos
                          </div>
                          <div className="text-xs text-gray-500 mt-2">
                            ({formatUptimeDisplay(sensorUptime.pump).formatted})
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (selectedOption === 'chiller_enfriado_agua_segundos') ? (
                  <>
                    {/* Chiller enfriado por agua */}
                    <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-blue-500">
                      <h4 className="text-lg font-semibold text-blue-700 mb-3">Chiller enfriado por agua</h4>
                      <div className="space-y-2">
                        <div className="text-sm text-gray-600">Tiempo encendido:</div>
                        <div className="space-y-1">
                          <div className="text-lg font-bold text-blue-600">
                            {formatUptimeDisplay(sensorUptime.water).hours} Horas
                          </div>
                          <div className="text-md font-semibold text-blue-500">
                            {formatUptimeDisplay(sensorUptime.water).minutes} minutos
                          </div>
                          <div className="text-sm font-medium text-blue-400">
                            {formatUptimeDisplay(sensorUptime.water).seconds} segundos
                          </div>
                          <div className="text-xs text-gray-500 mt-2">
                            ({formatUptimeDisplay(sensorUptime.water).formatted})
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Horómetro bomba de proceso (nuevo en enfriado agua) */}
                    <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-green-500">
                      <h4 className="text-lg font-semibold text-green-700 mb-3">Bomba de proceso (STATUS VDF)</h4>
                      <div className="space-y-2">
                        <div className="text-sm text-gray-600">Tiempo encendido:</div>
                        <div className="space-y-1">
                          <div className="text-lg font-bold text-green-600">
                            {formatUptimeDisplay(sensorUptime.pump).hours} Horas
                          </div>
                          <div className="text-md font-semibold text-green-500">
                            {formatUptimeDisplay(sensorUptime.pump).minutes} minutos
                          </div>
                          <div className="text-sm font-medium text-green-400">
                            {formatUptimeDisplay(sensorUptime.pump).seconds} segundos
                          </div>
                          <div className="text-xs text-gray-500 mt-2">
                            ({formatUptimeDisplay(sensorUptime.pump).formatted})
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  /* chiller_agua_segundos (legacy) */
                  <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-blue-500">
                    <h4 className="text-lg font-semibold text-blue-700 mb-3">Chiller enfriado por agua</h4>
                    <div className="space-y-2">
                      <div className="text-sm text-gray-600">Tiempo encendido:</div>
                      <div className="space-y-1">
                        <div className="text-lg font-bold text-blue-600">
                          {formatUptimeDisplay(sensorUptime.water).hours} Horas
                        </div>
                        <div className="text-md font-semibold text-blue-500">
                          {formatUptimeDisplay(sensorUptime.water).minutes} minutos
                        </div>
                        <div className="text-sm font-medium text-blue-400">
                          {formatUptimeDisplay(sensorUptime.water).seconds} segundos
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          ({formatUptimeDisplay(sensorUptime.water).formatted})
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        {/* Estados de componentes */}
        {(selectedOption === 'chiller_aire_segundos' || selectedOption === 'chiller_agua_segundos') && componentStatus.timestamp && (
          <div className="p-6 bg-gradient-to-r from-purple-50 to-indigo-50 border-b">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Estado Actual de Componentes</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {selectedOption === 'chiller_aire_segundos' ? (
                <>
                  {/* Compresor */}
                  <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-purple-500">
                    <h4 className="text-md font-semibold text-purple-700 mb-2">Compresor</h4>
                    <div className={`text-lg font-bold ${componentStatus.compresor === 1 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatStatus(componentStatus.compresor)}
                    </div>
                  </div>

                  {/* Ventilador */}
                  <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-blue-500">
                    <h4 className="text-md font-semibold text-blue-700 mb-2">Ventilador</h4>
                    <div className={`text-lg font-bold ${componentStatus.ventilador === 1 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatStatus(componentStatus.ventilador)}
                    </div>
                  </div>

                  {/* Bomba de proceso */}
                  <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-green-500">
                    <h4 className="text-md font-semibold text-green-700 mb-2">Bomba de proceso</h4>
                    <div className={`text-lg font-bold ${componentStatus.bomba_proceso === 1 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatStatus(componentStatus.bomba_proceso)}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Compresor */}
                  <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-purple-500">
                    <h4 className="text-md font-semibold text-purple-700 mb-2">Compresor</h4>
                    <div className={`text-lg font-bold ${componentStatus.compresor === 1 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatStatus(componentStatus.compresor)}
                    </div>
                  </div>

                  {/* Bomba del condensador */}
                  <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-blue-500">
                    <h4 className="text-md font-semibold text-blue-700 mb-2">Bomba del condensador</h4>
                    <div className={`text-lg font-bold ${componentStatus.bomba_condensador === 1 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatStatus(componentStatus.bomba_condensador)}
                    </div>
                  </div>

                  {/* Bomba de proceso */}
                  <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-green-500">
                    <h4 className="text-md font-semibold text-green-700 mb-2">Bomba de proceso</h4>
                    <div className={`text-lg font-bold ${componentStatus.bomba_proceso === 1 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatStatus(componentStatus.bomba_proceso)}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="text-xs text-gray-500 mt-4">
              Última actualización: {componentStatus.timestamp ? formatDateTime(componentStatus.timestamp) : 'N/A'}
            </div>
          </div>
        )}

        {/* Promedios de temperatura */}
        {(selectedOption === 'chiller_aire_minutos' || selectedOption === 'chiller_agua_minutos') && dateFilter && temperatureAverages.avg_temp_entrada !== null && (
          <div className="p-6 bg-gradient-to-r from-orange-50 to-red-50 border-b">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Temperatura del Día</h3>

            <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-orange-500">
              <h4 className="text-lg font-semibold text-orange-700 mb-3">
                {selectedOption === 'chiller_aire_minutos' ? 'Chiller enfriado por aire' : 'Chiller enfriado por agua'}
              </h4>

              <div className="space-y-1">
                <div className="text-md text-gray-700 font-medium">
                  Temperatura del día {formatDisplayDate(dateFilter)}:
                </div>
                <div className="text-lg font-semibold text-orange-600">
                  Entrada al evaporador: {temperatureAverages.avg_temp_entrada}°C
                </div>
                <div className="text-lg font-semibold text-red-600">
                  Salida del evaporador: {temperatureAverages.avg_temp_salida}°C
                </div>

                {selectedOption === 'chiller_agua_minutos' && temperatureAverages.avg_temp_cisterna2 !== null && (
                  <div className="text-lg font-semibold text-cyan-600">
                    Temperatura Cisterna 2: {temperatureAverages.avg_temp_cisterna2}°C
                  </div>
                )}

                <div className="text-xs text-gray-500 mt-3">
                  Basado en {temperatureAverages.total_records} registros del día
                </div>
              </div>
            </div>
          </div>
        )}

        {/* KWH IMP medianoche */}
        {selectedOption === 'ion_meter_minutos' && dateFilter && midnightKWH !== null && (
          <div className="p-6 bg-gradient-to-r from-purple-50 to-indigo-50 border-b">
            <h3 className="text-xl font-bold text-gray-800 mb-4">KWH IMP de Medianoche</h3>
            <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-purple-500">
              <h4 className="text-lg font-semibold text-purple-700 mb-3">
                Medidor Ion - {formatDisplayDate(dateFilter)}
              </h4>
              <div className="text-lg font-semibold text-purple-600">
                {midnightKWH !== null && !isNaN(midnightKWH) ? `${midnightKWH} kWh` : 'N/A'}
              </div>
            </div>
          </div>
        )}

        {selectedOption === 'ion_meter_minutos' && dateFilter && midnightKWH === null && (
          <div className="p-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-b">
            <div className="text-center text-yellow-700">
              <h3 className="text-lg font-semibold mb-2">No hay datos de KWH IMP de medianoche disponibles</h3>
              <p className="text-sm">No se encontró registro de KWH IMP para la medianoche de la fecha {formatDisplayDate(dateFilter)}</p>
            </div>
          </div>
        )}

        {/* Resumen Bitácora */}
        {selectedOption === 'resumen_bitacora' && dateFilter && (
          <div className="p-6 bg-gradient-to-r from-blue-50 to-cyan-50 border-b overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
            <h3 className="text-xl font-bold text-gray-800 mb-6">Resumen Bitácora - {formatDisplayDate(dateFilter)}</h3>

            <div className="max-w-4xl mx-auto mb-6">
              <div className="bg-white rounded-lg shadow-lg p-4">
                <h4 className="text-md font-semibold text-gray-800">Main Meter ION7300 kWh – Copenergy SA</h4>
                <p className="text-2xl font-bold text-blue-600">{summaryData.main_meter_kwh ?? 'N/A'}</p>
                <p className="text-sm text-gray-500">Corresponde a las 00:00 del día {getNextDayDate(dateFilter)}</p>
              </div>
            </div>

            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <table className="min-w-full">
                  <thead className="bg-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Campo</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(summaryData)
                      .filter(([key]) => key !== 'date' && key !== 'next_day' && key !== 'main_meter_kwh')
                      .map(([key, value]) => {
                        // ✅ SOLO CAMBIO DE LABELS (sin tocar las llaves del backend)
                        const labelOverrides = {
                          hourmeter_water_chiller: 'Daily hours of work – Water Chiller',
                          hourmeter_air_chiller: 'Daily hours of work – Air Chiller',
                        };

                        const label =
                          labelOverrides[key] ??
                          key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                        return (
                          <tr key={key}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{label}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-800">{value ?? 'N/A'}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Sin fecha */}
        {!dateFilter && (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Por favor, seleccione una fecha para ver los registros
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="m-2 p-4 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}

        {/* Tabla */}
        {dateFilter && selectedOption !== 'resumen_bitacora' && (
          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-auto">
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <thead className="sticky top-0 z-10">
                  {renderTableHeaders()}
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {renderTableRows()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
