import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Componente de icono para mostrar/ocultar contraseña
const EyeIcon = ({ isVisible, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
  >
    {isVisible ? (
      // Icono de ojo cerrado (ocultar)
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
      </svg>
    ) : (
      // Icono de ojo abierto (mostrar)
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    )}
  </button>
);

export default function Login({ onLogin }) {
  const [credentials, setCredentials] = useState({
    usuario: '',
    contrasena: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Cargar credenciales guardadas al montar el componente
  useEffect(() => {
    const savedCredentials = localStorage.getItem('savedCredentials');
    if (savedCredentials) {
      try {
        const parsed = JSON.parse(savedCredentials);
        setCredentials({
          usuario: parsed.usuario || '',
          contrasena: parsed.contrasena || ''
        });
        setRememberMe(true);
      } catch (error) {
        console.error('Error al cargar credenciales guardadas:', error);
      }
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('http://tegus.arrayanhn.com:3001/api/auth/login', credentials);
      
      if (response.data.success) {
        // Guardar token en localStorage
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('usuario', JSON.stringify(response.data.usuario));
        
        // Guardar credenciales si está marcado "Recordarme"
        if (rememberMe) {
          localStorage.setItem('savedCredentials', JSON.stringify({
            usuario: credentials.usuario,
            contrasena: credentials.contrasena
          }));
        } else {
          localStorage.removeItem('savedCredentials');
        }
        
        // Configurar axios para usar el token
        axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        
        // Llamar callback de login exitoso
        onLogin(response.data.usuario);
        
        // Redireccionar al home (control del chiller)
        window.location.href = '/';
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Chiller Control</h1>
          <p className="text-gray-600">Iniciar Sesión</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Usuario
            </label>
            <input
              type="text"
              name="usuario"
              value={credentials.usuario}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ingrese su usuario"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="contrasena"
                value={credentials.contrasena}
                onChange={handleChange}
                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ingrese su contraseña"
                required
              />
              <EyeIcon
                isVisible={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              id="remember-me"
              name="remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
              Recordar usuario y contraseña
            </label>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 transition-colors"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>

      </div>
    </div>
  );
}
