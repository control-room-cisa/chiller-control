import React, { useEffect, useState } from "react";
import {
    AppBar,
    Toolbar,
    Typography,
    Button,
    Stack,
    Chip,
    Box,
    Container,
    Card,
    CardContent,
    Grid,
    CircularProgress,
    FormControl,
    Select,
    MenuItem,
} from "@mui/material";

import AcUnitIcon from "@mui/icons-material/AcUnit";
import WaterIcon from "@mui/icons-material/Water";
import LogoutIcon from "@mui/icons-material/Logout";
import DownloadIcon from "@mui/icons-material/Download";

import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

import dayjs from "dayjs";
import axios from "axios";
import * as XLSX from "xlsx";

// API call
const api = axios.create({
    baseURL: "http://tegus.arrayanhn.com:3001/api",
    timeout: 30000,
});

// ✅ SOLO SEGUNDOS
const getConsumoBombaSegundos = ({ table, date }) => {
    return api.get("/chiller/data/bomba/segundos", {
        params: { table, date },
    });
};

const getConsumoBombaSegundosAvgDia = ({ table, date }) => {
    return api.get("/chiller/data/bomba/segundos/avg", {
        params: { table, date },
    });
};

// Main Component
const ConsumoDataLoger = () => {
    const [fecha, setFecha] = useState(dayjs());
    // ✅ mantener Select pero con default a segundos
    const [dataset, setDataset] = useState("bomba_proceso_segundos");

    // State for the summary card
    const [resumen, setResumen] = useState({
        loading: false,
        error: null,
        total_records: 0,
        consumo_promedio: null,
        consumo_total: null,
    });

    // State for the table
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalRecords, setTotalRecords] = useState(0);
    const [error, setError] = useState(null);

    // Fetch summary (SEGUNDOS)
    useEffect(() => {
        if (!fecha || !dataset) return;

        const fetchResumen = async () => {
            try {
                setResumen((s) => ({ ...s, loading: true, error: null }));

                const dateStr = fecha.format("YYYY-MM-DD");
                const resp = await getConsumoBombaSegundosAvgDia({ table: dataset, date: dateStr });

                if (resp?.data?.success) {
                    setResumen({
                        loading: false,
                        error: null,
                        total_records: resp.data.total_records ?? 0,
                        consumo_promedio:
                            resp.data.consumo_promedio != null ? Number(resp.data.consumo_promedio) : null,
                        consumo_total: resp.data.consumo_total != null ? Number(resp.data.consumo_total) : null,
                    });
                } else {
                    setResumen((s) => ({
                        ...s,
                        loading: false,
                        error: "Respuesta inválida del servidor",
                        total_records: 0,
                        consumo_promedio: null,
                        consumo_total: null,
                    }));
                }
            } catch (err) {
                console.error("Error resumen bomba:", err);
                setResumen((s) => ({
                    ...s,
                    loading: false,
                    error: "Error al cargar resumen",
                    total_records: 0,
                    consumo_promedio: null,
                    consumo_total: null,
                }));
            }
        };

        fetchResumen();
    }, [fecha, dataset]);

    // Fetch table data (SEGUNDOS)
    useEffect(() => {
        if (!fecha || !dataset) return;

        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);

                const normalizedDate = fecha.startOf("day");
                const response = await getConsumoBombaSegundos({
                    table: dataset,
                    date: normalizedDate.format("YYYY-MM-DD"),
                });

                if (response?.data?.success) {
                    setRows(response.data.data || []);
                    setTotalRecords(response.data.total_records || 0);
                } else {
                    setRows([]);
                    setTotalRecords(0);
                    setError("Respuesta inválida del servidor");
                }
            } catch (err) {
                console.error("Error cargando consumo bomba:", err);
                setRows([]);
                setTotalRecords(0);
                setError("Error al cargar los datos");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [fecha, dataset]);

    // ✅ Export XLSX
    const handleExportXlsx = () => {
        if (!rows || rows.length === 0) return;

        const exportData = rows.map((row) => ({
            "Fecha / Hora": row.fecha_hora
                ? dayjs(row.fecha_hora, "YYYY-MM-DD HH:mm:ss").format("DD/MM/YYYY HH:mm:ss")
                : "",
            "Consumo bomba proceso":
                row.consumo_bomba_proceso != null ? Number(row.consumo_bomba_proceso) : "",
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        ws["!cols"] = [{ wch: 22 }, { wch: 24 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Consumo");

        const fileName = `consumo_bomba_segundos_${fecha.format("YYYY-MM-DD")}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    return (
        <Box sx={{ minHeight: "100vh", bgcolor: "#f4f6f8" }}>
            {/* Header */}
            <AppBar
                position="sticky"
                elevation={0}
                sx={{
                    background: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)",
                }}
            >
                <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <AcUnitIcon />
                        <Typography variant="h6" fontWeight={600}>
                            Interfaz de Consumo – Chiller
                        </Typography>
                    </Stack>

                    <Stack direction="row" spacing={2} alignItems="center">
                        <Chip
                            icon={<WaterIcon />}
                            label="Chiller Agua / Aire"
                            variant="outlined"
                            sx={{ color: "#fff", borderColor: "rgba(255,255,255,0.6)" }}
                        />
                        <Button color="inherit" startIcon={<LogoutIcon />}>
                            Cerrar sesión
                        </Button>
                    </Stack>
                </Toolbar>
            </AppBar>

            {/* Main Content */}
            <Container maxWidth="xl" sx={{ mt: 4 }}>
                {/* Filter Section */}
                <Card sx={{ mb: 4 }}>
                    <CardContent>
                        <Grid container spacing={2} alignItems="center" justifyContent="space-between">
                            <Grid item xs={12} md={6}>
                                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                                    Base de datos
                                </Typography>

                                {/* ✅ Mantener Select como antes, pero solo con la opción de segundos */}
                                <FormControl size="small" sx={{ width: 550 }}>
                                    <Select
                                        id="dataset-select"
                                        value={dataset}
                                        onChange={(e) => setDataset(e.target.value)}
                                        displayEmpty
                                    >
                                        <MenuItem value="bomba_proceso_segundos">Bomba proceso segundos</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid item xs={12} md={6}>
                                <Box
                                    sx={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: { xs: "flex-start", md: "flex-end" },
                                    }}
                                >
                                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                                        Seleccionar fecha
                                    </Typography>

                                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                                        <DatePicker
                                            value={fecha}
                                            onChange={(newValue) => setFecha(newValue)}
                                            format="DD/MM/YYYY"
                                            slotProps={{
                                                textField: {
                                                    size: "small",
                                                    sx: { width: 550 },
                                                },
                                            }}
                                        />
                                    </LocalizationProvider>
                                </Box>
                            </Grid>
                        </Grid>
                    </CardContent>
                </Card>

                {/* Resumen Card */}
                <Card sx={{ mb: 4, borderLeft: "6px solid #ff6f00", backgroundColor: "#fff" }}>
                    <CardContent>
                        <Typography variant="h6" sx={{ color: "#ff6f00", mb: 2, fontWeight: 600 }}>
                            Bomba de proceso
                        </Typography>

                        <Typography sx={{ mb: 1 }}>Consumo del día {fecha.format("DD/MM/YYYY")}:</Typography>

                        {resumen.loading ? (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 2 }}>
                                <CircularProgress size={22} />
                                <Typography color="text.secondary">Cargando resumen…</Typography>
                            </Box>
                        ) : resumen.error ? (
                            <Typography color="error.main" sx={{ mt: 2 }}>
                                {resumen.error}
                            </Typography>
                        ) : (
                            <>
                                <Typography sx={{ color: "#0288d1", mb: 1 }}>
                                    Consumo promedio:{" "}
                                    <strong>
                                        {resumen.consumo_promedio != null ? `${resumen.consumo_promedio.toFixed(2)}` : "—"}{" "}
                                        kW
                                    </strong>
                                </Typography>

                                <Typography variant="caption" color="text.secondary">
                                    Basado en {resumen.total_records} registros del día
                                </Typography>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Table Section */}
                <Card>
                    <CardContent>
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                            <Box>
                                <Typography variant="h6" gutterBottom>
                                    Registros por segundo – Consumo bomba de proceso
                                </Typography>

                                <Typography variant="caption" color="text.secondary">
                                    {totalRecords} registros encontrados
                                </Typography>
                            </Box>

                            {!loading && !error && rows.length > 0 && (
                                <Button
                                    variant="contained"
                                    startIcon={<DownloadIcon />}
                                    onClick={handleExportXlsx}
                                    sx={{ height: 40 }}
                                >
                                    Exportar datos
                                </Button>
                            )}
                        </Box>

                        {loading ? (
                            <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
                                <CircularProgress />
                            </Box>
                        ) : error ? (
                            <Box sx={{ mt: 4, textAlign: "center", color: "error.main" }}>{error}</Box>
                        ) : (
                            <Box sx={{ overflowX: "auto", mt: 2 }}>
                                <table
                                    style={{
                                        width: "100%",
                                        borderCollapse: "collapse",
                                        fontSize: 14,
                                    }}
                                >
                                    <thead>
                                        <tr style={{ backgroundColor: "#e3f2fd" }}>
                                            <th style={{ padding: 20, textAlign: "left", fontSize: 18, fontWeight: 700 }}>
                                                Fecha / Hora
                                            </th>
                                            <th style={{ padding: 20, textAlign: "right", fontSize: 18, fontWeight: 700 }}>
                                                Consumo bomba proceso kW
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {rows.length === 0 ? (
                                            <tr>
                                                <td colSpan={2} style={{ padding: 16, textAlign: "center" }}>
                                                    No hay datos para la fecha seleccionada
                                                </td>
                                            </tr>
                                        ) : (
                                            rows.map((row) => (
                                                <tr key={row.id ?? row.fecha_hora} style={{ borderBottom: "1px solid #ddd" }}>
                                                    <td style={{ padding: 10, fontSize: 17, lineHeight: 1.4 }}>
                                                        {row.fecha_hora
                                                            ? dayjs(row.fecha_hora, "YYYY-MM-DD HH:mm:ss").format("DD/MM/YYYY HH:mm:ss")
                                                            : "-"}
                                                    </td>

                                                    <td
                                                        style={{
                                                            padding: 10,
                                                            textAlign: "right",
                                                            fontWeight: 600,
                                                            fontSize: 17,
                                                            lineHeight: 1.4,
                                                        }}
                                                    >
                                                        {Number(row.consumo_bomba_proceso).toFixed(2)}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </Box>
                        )}
                    </CardContent>
                </Card>
            </Container>
        </Box>
    );
};

export default ConsumoDataLoger;
