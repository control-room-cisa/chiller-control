import React, { useEffect, useState, useRef, useCallback } from "react";
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
import LogoutIcon from "@mui/icons-material/Logout";
import DownloadIcon from "@mui/icons-material/Download";

import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

import dayjs from "dayjs";
import axios from "axios";
import * as XLSX from "xlsx";
import { useAuth } from "../context/AuthContext.jsx";
import Login from "./Login.jsx";

import { useNavigate } from "react-router-dom";
import TouchAppIcon from "@mui/icons-material/TouchApp";

const api = axios.create({
    baseURL: "http://tegus.arrayanhn.com:3001/api",
    timeout: 30000,
});

const getConsumoBombaSegundos = ({ table, date, page, limit }) =>
    api.get("/chiller/data/bomba/segundos", { params: { table, date, page, limit } });

const getConsumoBombaSegundosAvgDia = ({ table, date }) =>
    api.get("/chiller/data/bomba/segundos/avg", { params: { table, date } });

const getConsumoChillerAguaSegundos = ({ date, page, limit }) =>
    api.get("/chiller/data/consumo/agua/segundos", { params: { date, page, limit } });

const getConsumoChillerAguaAvg = ({ date }) =>
    api.get("/chiller/data/consumo/agua/segundos/avg", { params: { date } });

const getConsumoChillerAireSegundos = ({ date, page, limit }) =>
    api.get("/chiller/data/consumo/aire/segundos", { params: { date, page, limit } });

const getConsumoChillerAireAvg = ({ date }) =>
    api.get("/chiller/data/consumo/aire/segundos/avg", { params: { date } });

// ============================================
// 📥 FUNCIONES API PARA EXPORTAR TODO EL DÍA
// ============================================
const getConsumoBombaSegundosExport = ({ table, date }) =>
    api.get("/chiller/data/bomba/segundos/export", { params: { table, date } });

const getConsumoChillerAguaSegundosExport = ({ date }) =>
    api.get("/chiller/data/consumo/agua/segundos/export", { params: { date } });

const getConsumoChillerAireSegundosExport = ({ date }) =>
    api.get("/chiller/data/consumo/aire/segundos/export", { params: { date } });


const DATASET_OPTIONS = [
    { value: "bomba_proceso_segundos", label: "Consumo bomba proceso segundos" },
    { value: "consumo_chiller_agua_segundos", label: "Consumo chiller agua segundos" },
    { value: "consumo_chiller_aire_segundos", label: "Consumo chiller aire segundos" },
];

const RESUMEN_VACIO = {
    loading: false,
    error: null,
    total_records: 0,
    consumo_promedio: null,
    total_compresor_agua: null,
    total_evaporador_agua: null,
    total_bomba_agua_potable: null,
    total_compresor_aire: null,
    total_evaporador_aire: null,
};

const ConsumoDataLoger = () => {
    const { user, isAuthenticated, logout } = useAuth();

    if (!isAuthenticated) return <Login onLogin={() => { }} />;

    const [fecha, setFecha] = useState(dayjs());
    const [dataset, setDataset] = useState("bomba_proceso_segundos");
    const [resumen, setResumen] = useState(RESUMEN_VACIO);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [totalRecords, setTotalRecords] = useState(0);
    const [error, setError] = useState(null);

    // Estados para scroll infinito
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [recordsPerPage] = useState(100);
    const observerTarget = useRef(null);

    const dateStr = fecha.format("YYYY-MM-DD");
    const esBomba = dataset === "bomba_proceso_segundos";
    const esAgua = dataset === "consumo_chiller_agua_segundos";
    const esAire = dataset === "consumo_chiller_aire_segundos";

    const [exportingFull, setExportingFull] = useState(false);

    const navigate = useNavigate();

    // Fetch resumen
    useEffect(() => {
        if (!fecha || !dataset) return;
        const fetchResumen = async () => {
            setResumen({ ...RESUMEN_VACIO, loading: true });
            try {
                if (esBomba) {
                    const resp = await getConsumoBombaSegundosAvgDia({ table: dataset, date: dateStr });
                    if (resp?.data?.success) {
                        setResumen({
                            loading: false, error: null,
                            total_records: resp.data.total_records ?? 0,
                            consumo_promedio: resp.data.consumo_promedio != null ? Number(resp.data.consumo_promedio) : null,
                            total_compresor_agua: null,
                            total_evaporador_agua: null,
                            total_bomba_agua_potable: null,
                            total_compresor_aire: null,
                            total_evaporador_aire: null,
                        });
                    } else throw new Error("Respuesta inválida");
                }
                if (esAgua) {
                    const resp = await getConsumoChillerAguaAvg({ date: dateStr });
                    if (resp?.data?.success) {
                        setResumen({
                            loading: false, error: null,
                            total_records: resp.data.total_records ?? 0,
                            consumo_promedio: null,
                            total_compresor_agua: resp.data.total_compresor_agua != null ? Number(resp.data.total_compresor_agua) : null,
                            total_evaporador_agua: resp.data.total_evaporador_agua != null ? Number(resp.data.total_evaporador_agua) : null,
                            total_bomba_agua_potable: resp.data.total_bomba_agua_potable != null ? Number(resp.data.total_bomba_agua_potable) : null,
                            total_compresor_aire: null,
                            total_evaporador_aire: null,
                        });
                    } else throw new Error("Respuesta inválida");
                }
                if (esAire) {
                    const resp = await getConsumoChillerAireAvg({ date: dateStr });
                    if (resp?.data?.success) {
                        setResumen({
                            loading: false, error: null,
                            total_records: resp.data.total_records ?? 0,
                            consumo_promedio: null,
                            total_compresor_agua: null,
                            total_evaporador_agua: null,
                            total_bomba_agua_potable: null,
                            total_compresor_aire: resp.data.total_compresor_aire != null ? Number(resp.data.total_compresor_aire) : null,
                            total_evaporador_aire: resp.data.total_evaporador_aire != null ? Number(resp.data.total_evaporador_aire) : null,
                        });
                    } else throw new Error("Respuesta inválida");
                }
            } catch (err) {
                console.error("Error resumen:", err);
                setResumen({ ...RESUMEN_VACIO, error: "Error al cargar resumen" });
            }
        };
        fetchResumen();
    }, [fecha, dataset, dateStr, esBomba, esAgua, esAire]);

    // Fetch inicial de datos (primera carga)
    useEffect(() => {
        if (!fecha || !dataset) return;
        const fetchInitialData = async () => {
            setLoading(true);
            setError(null);
            setRows([]);
            setPage(1);
            setHasMore(true);

            try {
                let response;
                if (esBomba) {
                    response = await getConsumoBombaSegundos({
                        table: dataset,
                        date: fecha.startOf("day").format("YYYY-MM-DD"),
                        page: 1,
                        limit: recordsPerPage
                    });
                }
                if (esAgua) {
                    response = await getConsumoChillerAguaSegundos({
                        date: dateStr,
                        page: 1,
                        limit: recordsPerPage
                    });
                }
                if (esAire) {
                    response = await getConsumoChillerAireSegundos({
                        date: dateStr,
                        page: 1,
                        limit: recordsPerPage
                    });
                }
                if (response?.data?.success) {
                    const newRows = response.data.data || [];
                    setRows(newRows);
                    setTotalRecords(response.data.total_records || 0);

                    const hasMoreData = newRows.length === recordsPerPage &&
                        newRows.length < response.data.total_records;
                    setHasMore(hasMoreData);
                } else {
                    setRows([]);
                    setTotalRecords(0);
                    setHasMore(false);
                    setError("Respuesta inválida del servidor");
                }
            } catch (err) {
                console.error("Error cargando datos:", err);
                setRows([]);
                setTotalRecords(0);
                setHasMore(false);
                setError("Error al cargar los datos");
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, [fecha, dataset, dateStr, esBomba, esAgua, esAire, recordsPerPage]);

    // Función para cargar más datos
    const loadMoreData = useCallback(async () => {
        if (loadingMore || !hasMore) return;

        setLoadingMore(true);

        try {
            const nextPage = page + 1;
            let response;

            if (esBomba) {
                response = await getConsumoBombaSegundos({
                    table: dataset,
                    date: fecha.startOf("day").format("YYYY-MM-DD"),
                    page: nextPage,
                    limit: recordsPerPage
                });
            }
            if (esAgua) {
                response = await getConsumoChillerAguaSegundos({
                    date: dateStr,
                    page: nextPage,
                    limit: recordsPerPage
                });
            }
            if (esAire) {
                response = await getConsumoChillerAireSegundos({
                    date: dateStr,
                    page: nextPage,
                    limit: recordsPerPage
                });
            }

            if (response?.data?.success) {
                const newRows = response.data.data || [];

                if (newRows.length > 0) {
                    setRows(prevRows => [...prevRows, ...newRows]);
                    setPage(nextPage);

                    const currentTotal = rows.length + newRows.length;
                    setHasMore(currentTotal < response.data.total_records);
                } else {
                    setHasMore(false);
                }
            }
        } catch (err) {
            console.error("Error cargando más datos:", err);
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, hasMore, page, esBomba, esAgua, esAire, dataset, fecha, dateStr, recordsPerPage, rows.length]);

    // Intersection Observer para detectar cuando llegar al final
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !loadingMore) {
                    loadMoreData();
                }
            },
            { threshold: 0.1 }
        );

        const currentTarget = observerTarget.current;
        if (currentTarget) {
            observer.observe(currentTarget);
        }

        return () => {
            if (currentTarget) {
                observer.unobserve(currentTarget);
            }
        };
    }, [hasMore, loadingMore, loadMoreData]);

    // ============================================
    // 📊 FUNCIÓN PARA EXPORTAR TODOS LOS DATOS
    // ============================================
    const handleExportXlsx = async () => {
        setExportingFull(true);

        try {
            let response;

            if (esBomba) {
                response = await getConsumoBombaSegundosExport({
                    table: dataset,
                    date: dateStr
                });
            }
            if (esAgua) {
                response = await getConsumoChillerAguaSegundosExport({
                    date: dateStr
                });
            }
            if (esAire) {
                response = await getConsumoChillerAireSegundosExport({
                    date: dateStr
                });
            }

            if (!response?.data?.success || !response.data.data) {
                throw new Error("No se pudieron obtener los datos para exportar");
            }

            const allRows = response.data.data;

            if (allRows.length === 0) {
                alert("No hay datos para exportar");
                return;
            }

            let exportData;
            if (esBomba) {
                exportData = allRows.map((row) => ({
                    "Fecha / Hora": row.fecha_hora
                        ? dayjs(row.fecha_hora, "YYYY-MM-DD HH:mm:ss").format("DD/MM/YYYY HH:mm:ss")
                        : "",
                    "Consumo bomba proceso (kW)": row.consumo_bomba_proceso != null
                        ? Number(row.consumo_bomba_proceso)
                        : "",
                }));
            }
            if (esAgua) {
                exportData = allRows.map((row) => ({
                    "Fecha / Hora": row.fecha_hora
                        ? dayjs(row.fecha_hora, "YYYY-MM-DD HH:mm:ss").format("DD/MM/YYYY HH:mm:ss")
                        : "",
                    "Consumo compresor agua (kW)": row.consumo_compresor_agua != null
                        ? Number(row.consumo_compresor_agua)
                        : "",
                    "Consumo evaporador agua (kW)": row.consumo_evaporador_agua != null
                        ? Number(row.consumo_evaporador_agua)
                        : "",
                    "Consumo bomba agua potable (kW)": row.consumo_bomba_agua_potable != null
                        ? Number(row.consumo_bomba_agua_potable)
                        : "",
                }));
            }
            if (esAire) {
                exportData = allRows.map((row) => ({
                    "Fecha / Hora": row.fecha_hora
                        ? dayjs(row.fecha_hora, "YYYY-MM-DD HH:mm:ss").format("DD/MM/YYYY HH:mm:ss")
                        : "",
                    "Consumo compresor aire (kW)": row.consumo_compresor_aire != null
                        ? Number(row.consumo_compresor_aire)
                        : "",
                    "Consumo evaporador aire (kW)": row.consumo_evaporador_aire != null
                        ? Number(row.consumo_evaporador_aire)
                        : "",
                }));
            }

            const ws = XLSX.utils.json_to_sheet(exportData);
            ws["!cols"] = Object.keys(exportData[0] || {}).map(() => ({ wch: 26 }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Consumo");

            const filename = `consumo_${dataset}_${dateStr}_completo.xlsx`;
            XLSX.writeFile(wb, filename);

        } catch (err) {
            console.error("Error exportando datos:", err);
            alert("Error al exportar los datos. Por favor intenta de nuevo.");
        } finally {
            setExportingFull(false);
        }
    };

    // Render resumen
    const renderResumen = () => {
        if (resumen.loading) {
            return (
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 2 }}>
                    <CircularProgress size={22} />
                    <Typography color="text.secondary">Cargando resumen…</Typography>
                </Box>
            );
        }
        if (resumen.error) {
            return <Typography color="error.main" sx={{ mt: 2 }}>{resumen.error}</Typography>;
        }
        if (esBomba) {
            return (
                <>
                    <Typography sx={{ color: "#0288d1", mb: 1 }}>
                        Consumo promedio:{" "}
                        <strong>
                            {resumen.consumo_promedio != null
                                ? `${resumen.consumo_promedio.toFixed(2)} kW`
                                : "—"}
                        </strong>
                    </Typography>

                    <Typography variant="caption" color="text.secondary">
                        Basado en {resumen.total_records.toLocaleString()} registros del día
                    </Typography>
                </>
            );
        }
        if (esAgua) {
            return (
                <Grid container rowSpacing={1} columnSpacing={{ xs: 1, sm: 2, md: 3 }}>
                    {/* Compresor */}
                    <Grid size={{ xs: 12, sm: 6, md: 6, lg: 4, xl: 4 }}>
                        <Card
                            sx={{
                                borderLeft: "6px solid #13d102",
                                backgroundColor: "#fff",
                                height: "100%",
                            }}
                        >
                            <CardContent sx={{ p: 3 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                                    Consumo Chiller Compresor Agua
                                </Typography>

                                <Typography sx={{ color: "#0288d1", mb: 1 }}>
                                    Consumo del día {fecha.format("DD/MM/YYYY")}:
                                </Typography>

                                <Typography variant="h5" sx={{ color: "#0288d1", fontWeight: 700 }}>
                                    {resumen.total_compresor_agua != null
                                        ? `${resumen.total_compresor_agua.toFixed(2)} kWh`
                                        : "—"}
                                </Typography>

                                <Typography variant="caption" color="text.secondary">
                                    Basado en {resumen.total_records.toLocaleString()} registros del día
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Evaporador */}
                    <Grid size={{ xs: 12, sm: 6, md: 6, lg: 4, xl: 4 }}>
                        <Card
                            sx={{
                                borderLeft: "6px solid #f57c00",
                                backgroundColor: "#fff",
                                height: "100%",
                            }}
                        >
                            <CardContent sx={{ p: 3 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                                    Consumo Chiller Evaporador Agua
                                </Typography>

                                <Typography sx={{ color: "#f57c00", mb: 1 }}>
                                    Consumo del día {fecha.format("DD/MM/YYYY")}:
                                </Typography>

                                <Typography variant="h5" sx={{ color: "#f57c00", fontWeight: 700 }}>
                                    {resumen.total_evaporador_agua != null
                                        ? `${resumen.total_evaporador_agua.toFixed(2)} kWh`
                                        : "—"}
                                </Typography>

                                <Typography variant="caption" color="text.secondary">
                                    Basado en {resumen.total_records.toLocaleString()} registros del día
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Bomba agua potable */}
                    <Grid size={{ xs: 12, sm: 6, md: 6, lg: 4, xl: 4 }}>
                        <Card
                            sx={{
                                borderLeft: "6px solid #0288d1",
                                backgroundColor: "#fff",
                                height: "100%",
                            }}
                        >
                            <CardContent sx={{ p: 3 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                                    Consumo Bomba Agua Potable
                                </Typography>

                                <Typography sx={{ color: "#0288d1", mb: 1 }}>
                                    Consumo del día {fecha.format("DD/MM/YYYY")}:
                                </Typography>

                                <Typography variant="h5" sx={{ color: "#0288d1", fontWeight: 700 }}>
                                    {resumen.total_bomba_agua_potable != null
                                        ? `${resumen.total_bomba_agua_potable.toFixed(2)} kWh`
                                        : "—"}
                                </Typography>

                                <Typography variant="caption" color="text.secondary">
                                    Basado en {resumen.total_records.toLocaleString()} registros del día
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            );
        }
        if (esAire) {
            return (
                <Grid container rowSpacing={1} columnSpacing={{ xs: 1, sm: 2, md: 3 }}>
                    {/* Compresor aire */}
                    <Grid size={{ xs: 12, sm: 6, md: 6, lg: 6, xl: 6 }}>
                        <Card
                            sx={{
                                borderLeft: "6px solid #7b1fa2",
                                backgroundColor: "#fff",
                                height: "100%",
                            }}
                        >
                            <CardContent sx={{ p: 3 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                                    Consumo Chiller Compresor Aire
                                </Typography>

                                <Typography sx={{ color: "#7b1fa2", mb: 1 }}>
                                    Consumo del día {fecha.format("DD/MM/YYYY")}:
                                </Typography>

                                <Typography variant="h5" sx={{ color: "#7b1fa2", fontWeight: 700 }}>
                                    {resumen.total_compresor_aire != null
                                        ? `${resumen.total_compresor_aire.toFixed(2)} kWh`
                                        : "—"}
                                </Typography>

                                <Typography variant="caption" color="text.secondary">
                                    Basado en {resumen.total_records.toLocaleString()} registros del día
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Evaporador aire */}
                    <Grid size={{ xs: 12, sm: 6, md: 6, lg: 6, xl: 6 }}>
                        <Card
                            sx={{
                                borderLeft: "6px solid #e64a19",
                                backgroundColor: "#fff",
                                height: "100%",
                            }}
                        >
                            <CardContent sx={{ p: 3 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                                    Consumo Chiller Evaporador Aire
                                </Typography>

                                <Typography sx={{ color: "#e64a19", mb: 1 }}>
                                    Consumo del día {fecha.format("DD/MM/YYYY")}:
                                </Typography>

                                <Typography variant="h5" sx={{ color: "#e64a19", fontWeight: 700 }}>
                                    {resumen.total_evaporador_aire != null
                                        ? `${resumen.total_evaporador_aire.toFixed(2)} kWh`
                                        : "—"}
                                </Typography>

                                <Typography variant="caption" color="text.secondary">
                                    Basado en {resumen.total_records.toLocaleString()} registros del día
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            );
        }
    };

    return (
        <Box sx={{ minHeight: "100vh", bgcolor: "#f4f6f8" }}>
            {/* Header */}
            <AppBar
                position="sticky"
                elevation={0}
                sx={{ background: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)" }}
            >
                <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <AcUnitIcon />
                        <Typography variant="h6" fontWeight={600}>
                            Interfaz de Consumo – Chiller
                        </Typography>
                    </Stack>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Button
                            color="inherit"
                            variant="outlined"
                            startIcon={<TouchAppIcon />}
                            sx={{ borderColor: "rgba(255,255,255,0.6)", textTransform: "none" }}
                            onClick={() => navigate("/data_logger")}
                        >
                            Data Loger
                        </Button>

                        <Typography variant="body2" sx={{ color: "#fff" }}>
                            Bienvenido, <strong>{user?.usuario || "Usuario"}</strong>
                        </Typography>
                        <Button color="inherit" startIcon={<LogoutIcon />} onClick={logout}>
                            Cerrar sesión
                        </Button>
                    </Stack>
                </Toolbar>
            </AppBar>

            <Container maxWidth={false} sx={{ mt: 4, px: 3 }}>
                {/* Filtros */}
                <Card sx={{ mb: 4 }}>
                    <CardContent>
                        <Grid container spacing={2} alignItems="center" justifyContent="space-between">
                            <Grid size={{ xs: 12, sm: 6, md: 6, lg: 6, xl: 6 }}>
                                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                                    Base de datos
                                </Typography>
                                <FormControl size="small" sx={{ width: 550 }}>
                                    <Select
                                        value={dataset}
                                        onChange={(e) => setDataset(e.target.value)}
                                        displayEmpty
                                    >
                                        {DATASET_OPTIONS.map((opt) => (
                                            <MenuItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 6, lg: 6, xl: 6 }}>
                                <Box sx={{ display: "flex", flexDirection: "column", alignItems: { xs: "flex-start", md: "flex-end" } }}>
                                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                                        Seleccionar fecha
                                    </Typography>
                                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                                        <DatePicker
                                            value={fecha}
                                            onChange={(newValue) => setFecha(newValue)}
                                            format="DD/MM/YYYY"
                                            slotProps={{
                                                textField: { size: "small", sx: { width: 550 } },
                                            }}
                                        />
                                    </LocalizationProvider>
                                </Box>
                            </Grid>
                        </Grid>
                    </CardContent>
                </Card>

                {/* Resumen */}
                {esBomba ? (
                    <Card sx={{ mb: 4, borderLeft: "6px solid #ff6f00", backgroundColor: "#fff" }}>
                        <CardContent>
                            <Typography variant="h6" sx={{ color: "#ff6f00", mb: 2, fontWeight: 600 }}>
                                Bomba de proceso
                            </Typography>
                            <Typography sx={{ mb: 1 }}>
                                Consumo del día {fecha.format("DD/MM/YYYY")}:
                            </Typography>
                            {renderResumen()}
                        </CardContent>
                    </Card>
                ) : (
                    <Box sx={{ mb: 4 }}>
                        {renderResumen()}
                    </Box>
                )}

                {/* Tabla */}
                <Card>
                    <CardContent>
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                            <Box>
                                <Typography variant="h6" gutterBottom>
                                    {esBomba && "Registros por segundo – Consumo bomba de proceso"}
                                    {esAgua && "Registros por segundo – Consumo chiller agua"}
                                    {esAire && "Registros por segundo – Consumo chiller aire"}
                                </Typography>
                            </Box>
                            {!loading && !error && rows.length > 0 && (
                                <Button
                                    variant="contained"
                                    startIcon={exportingFull ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />}
                                    onClick={handleExportXlsx}
                                    disabled={exportingFull}
                                    sx={{ height: 40 }}
                                >
                                    {exportingFull
                                        ? "Exportando..."
                                        : `Exportar día completo (${totalRecords.toLocaleString()})`
                                    }
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
                            <>
                                <Box sx={{ overflowX: "auto", mt: 2, maxHeight: "600px", overflowY: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                                        <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                                            <tr style={{ backgroundColor: esBomba ? "#e3f2fd" : esAgua ? "#e8f5e9" : "#f3e5f5" }}>
                                                <th style={{ padding: 20, textAlign: "left", fontSize: 18, fontWeight: 700 }}>
                                                    Fecha / Hora
                                                </th>
                                                {esBomba && (
                                                    <th style={{ padding: 20, textAlign: "right", fontSize: 18, fontWeight: 700 }}>
                                                        Consumo bomba proceso kW
                                                    </th>
                                                )}
                                                {esAgua && (
                                                    <>
                                                        <th style={{ padding: 20, textAlign: "right", fontSize: 18, fontWeight: 700 }}>
                                                            Consumo compresor agua kW
                                                        </th>
                                                        <th style={{ padding: 20, textAlign: "right", fontSize: 18, fontWeight: 700 }}>
                                                            Consumo evaporador agua kW
                                                        </th>
                                                        <th style={{ padding: 20, textAlign: "right", fontSize: 18, fontWeight: 700 }}>
                                                            Consumo bomba agua potable kW
                                                        </th>
                                                    </>
                                                )}
                                                {esAire && (
                                                    <>
                                                        <th style={{ padding: 20, textAlign: "right", fontSize: 18, fontWeight: 700 }}>
                                                            Consumo compresor aire kW
                                                        </th>
                                                        <th style={{ padding: 20, textAlign: "right", fontSize: 18, fontWeight: 700 }}>
                                                            Consumo evaporador aire kW
                                                        </th>
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.length === 0 ? (
                                                <tr>
                                                    <td colSpan={esBomba ? 2 : esAgua ? 4 : 3} style={{ padding: 16, textAlign: "center" }}>
                                                        No hay datos para la fecha seleccionada
                                                    </td>
                                                </tr>
                                            ) : (
                                                rows.map((row, index) => (
                                                    <tr key={`${row.id ?? row.fecha_hora}-${index}`} style={{ borderBottom: "1px solid #ddd" }}>
                                                        <td style={{ padding: 10, fontSize: 17, lineHeight: 1.4 }}>
                                                            {row.fecha_hora
                                                                ? dayjs(row.fecha_hora, "YYYY-MM-DD HH:mm:ss").format("DD/MM/YYYY HH:mm:ss")
                                                                : "-"}
                                                        </td>
                                                        {esBomba && (
                                                            <td style={{ padding: 10, textAlign: "right", fontWeight: 600, fontSize: 17, lineHeight: 1.4 }}>
                                                                {Number(row.consumo_bomba_proceso).toFixed(2)}
                                                            </td>
                                                        )}
                                                        {esAgua && (
                                                            <>
                                                                <td style={{ padding: 10, textAlign: "right", fontWeight: 600, fontSize: 17, lineHeight: 1.4 }}>
                                                                    {row.consumo_compresor_agua != null ? Number(row.consumo_compresor_agua).toFixed(2) : "—"}
                                                                </td>
                                                                <td style={{ padding: 10, textAlign: "right", fontWeight: 600, fontSize: 17, lineHeight: 1.4 }}>
                                                                    {row.consumo_evaporador_agua != null ? Number(row.consumo_evaporador_agua).toFixed(2) : "—"}
                                                                </td>
                                                                <td style={{ padding: 10, textAlign: "right", fontWeight: 600, fontSize: 17, lineHeight: 1.4 }}>
                                                                    {row.consumo_bomba_agua_potable != null ? Number(row.consumo_bomba_agua_potable).toFixed(2) : "—"}
                                                                </td>
                                                            </>
                                                        )}
                                                        {esAire && (
                                                            <>
                                                                <td style={{ padding: 10, textAlign: "right", fontWeight: 600, fontSize: 17, lineHeight: 1.4 }}>
                                                                    {row.consumo_compresor_aire != null ? Number(row.consumo_compresor_aire).toFixed(2) : "—"}
                                                                </td>
                                                                <td style={{ padding: 10, textAlign: "right", fontWeight: 600, fontSize: 17, lineHeight: 1.4 }}>
                                                                    {row.consumo_evaporador_aire != null ? Number(row.consumo_evaporador_aire).toFixed(2) : "—"}
                                                                </td>
                                                            </>
                                                        )}
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>

                                    {/* Elemento observador para detectar scroll al final */}
                                    {hasMore && (
                                        <Box ref={observerTarget} sx={{ py: 2, textAlign: "center" }}>
                                            {loadingMore && <CircularProgress size={24} />}
                                        </Box>
                                    )}

                                    {!hasMore && rows.length > 0 && (
                                        <Box sx={{ py: 2, textAlign: "center" }}>
                                            <Typography variant="caption" color="text.secondary">
                                                No hay más registros para mostrar
                                            </Typography>
                                        </Box>
                                    )}
                                </Box>
                            </>
                        )}
                    </CardContent>
                </Card>
            </Container>
        </Box>
    );
};

export default ConsumoDataLoger;
