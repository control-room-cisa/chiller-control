import { useState, useEffect } from "react";
import { Power, ThermometerSnowflake, LogOut, Database } from "lucide-react";
import {
  Routes,
  Route,
  useNavigate,
  useLocation,
} from "react-router-dom";
import "./App.css";
import DataLogger from "./components/DataLogger";
import Login from "./components/Login";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import ConsumoDataLoger from "./components/ConsumoDataLoger.jsx";

// Use HTTP since SSL is not available
const DOMAIN = "tegus.arrayanhn.com";
const PORT = "3001";
const API_BASE_URL = `http://${DOMAIN}:${PORT}/api`;

// Chiller Control Component
const ChillerControl = () => {
  const [isOn, setIsOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/chiller/status`);
      const data = await response.json();
      if (data.success) {
        setIsOn(data.isOn);
      } else {
        setError(data.message);
      }
    } catch {
      setError("Error al obtener el estado del chiller");
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleTurnOn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_BASE_URL}/chiller/on`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      if (data.success) {
        setIsOn(true);
      } else {
        setError(data.message);
      }
    } catch {
      setError("Error al encender el chiller");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTurnOff = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_BASE_URL}/chiller/off`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      if (data.success) {
        setIsOn(false);
      } else {
        setError(data.message);
      }
    } catch {
      setError("Error al apagar el chiller");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="bg-blue-600 p-4">
          <h1 className="text-white text-center text-2xl font-bold">
            Control de Chiller
          </h1>
        </div>

        <div
          className={`p-6 text-center ${isOn ? "bg-green-100" : "bg-red-100"
            } border-b-4 ${isOn ? "border-green-400" : "border-red-400"} mb-4`}
        >
          <div className="flex items-center justify-center">
            <ThermometerSnowflake
              className={`mr-3 ${isOn ? "text-green-600" : "text-red-600"}`}
              size={32}
            />
            <div>
              <span
                className={`text-xl font-bold ${isOn ? "text-green-700" : "text-red-700"
                  }`}
              >
                {isOn ? "CHILLER ENCENDIDO" : "CHILLER APAGADO"}
              </span>
              <p className={`text-sm ${isOn ? "text-green-600" : "text-red-600"}`}>
                {isOn ? "Sistema en funcionamiento" : "Sistema detenido"}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-100 text-red-700 text-center">{error}</div>
        )}

        <div className="p-6 pt-2">
          <p className="text-gray-600 text-center mb-4 text-sm">
            Seleccione una acción:
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleTurnOn}
              disabled={isOn || isLoading}
              className={`flex-1 py-3 px-6 rounded-lg font-medium text-white ${isOn || isLoading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-600"
                } transition-all flex items-center justify-center shadow`}
            >
              <Power className="mr-2" size={20} />
              {isLoading ? "Procesando..." : "Encender"}
            </button>

            <button
              onClick={handleTurnOff}
              disabled={!isOn || isLoading}
              className={`flex-1 py-3 px-6 rounded-lg font-medium text-white ${!isOn || isLoading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-orange-500 hover:bg-orange-600"
                } transition-all flex items-center justify-center shadow`}
            >
              <Power className="mr-2" size={20} />
              {isLoading ? "Procesando..." : "Apagar"}
            </button>
          </div>
        </div>

        <div className="bg-gray-100 p-4 border-t border-gray-200">
          <p className="text-center text-gray-600">
            Estado actual:{" "}
            <span className={`font-medium ${isOn ? "text-green-600" : "text-red-600"}`}>
              {isOn ? "En funcionamiento" : "Detenido"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

// ✅ Layout SOLO para "/" y "/data_logger" (con header tailwind)
const AppShell = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-semibold text-gray-900">
              Sistema de Control - Chiller
            </h1>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Bienvenido, <span className="font-medium">{user?.usuario}</span>
              </span>

              {location.pathname !== "/data_logger" && (
                <button
                  onClick={() => navigate("/data_logger")}
                  className="inline-flex items-center px-3 py-2 border border-blue-300 text-sm leading-4 font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100"
                >
                  <Database className="mr-2 h-4 w-4" />
                  Data Logger
                </button>
              )}

              {location.pathname === "/data_logger" && (
                <button
                  onClick={() => navigate("/")}
                  className="inline-flex items-center px-3 py-2 border border-green-300 text-sm leading-4 font-medium rounded-md text-green-700 bg-green-50 hover:bg-green-100"
                >
                  Control Chiller
                </button>
              )}

              {/* RUTA PARA IR A LA INTERFAZ DE CONSUMO */}
              {location.pathname !== "/consumo" && (
                <button
                  onClick={() => navigate("/consumo")}
                  className="inline-flex items-center px-3 py-2 border border-purple-300 text-sm leading-4 font-medium rounded-md text-purple-700 bg-purple-50 hover:bg-purple-100"
                >
                  <Database className="mr-2 h-4 w-4" />
                  Consumo Chiller
                </button>
              )}

              <button
                onClick={logout}
                className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido SOLO para estas rutas */}
      <div className="min-h-screen flex items-center justify-center">
        <Routes>
          <Route path="/" element={<ChillerControl />} />
          <Route path="/data_logger" element={<DataLogger />} />
        </Routes>
      </div>
    </div>
  );
};

// Componente principal con autenticación
const AppContent = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return <Login onLogin={() => { }} />;

  return (
    <Routes>
      {/* ✅ /consumo sin el layout de arriba */}
      <Route path="/consumo" element={<ConsumoDataLoger />} />

      {/* ✅ todo lo demás usa AppShell */}
      <Route path="/*" element={<AppShell />} />
    </Routes>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
