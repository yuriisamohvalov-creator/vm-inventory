import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  CircularProgress,
  Alert,
  ButtonGroup,
  Snackbar
} from '@mui/material';
import {
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Code as JsonIcon
} from '@mui/icons-material';
import api from '../services/api';
import ReportTree from '../components/ReportTree';

const Reports = () => {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/report/');
      setReportData(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load report data');
      console.error('Error loading report:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    setExportLoading(true);
    setSnackbar({ open: false, message: '', severity: 'info' });
    
    try {
      // Определяем URL и имя файла
      let url = `/report/${format}/`;
      let filename = `vm_report.${format === 'xlsx' ? 'xlsx' : format}`;
      
      console.log(`Exporting to ${format} from ${url}`);
      
      // Важно: указываем responseType: 'blob' для получения бинарных данных
      const response = await api.get(url, {
        responseType: 'blob',
        // Добавляем заголовок для правильной обработки
        headers: {
          'Accept': format === 'json' 
            ? 'application/json' 
            : format === 'pdf' 
              ? 'application/pdf' 
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });

      console.log('Response received:', response);

      // Проверяем, что ответ действительно содержит данные
      if (!response.data || response.data.size === 0) {
        throw new Error('Empty response received');
      }

      // Создаем blob из полученных данных
      const blob = new Blob([response.data], { 
        type: response.headers['content-type'] || 
              (format === 'json' ? 'application/json' : 
               format === 'pdf' ? 'application/pdf' : 
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      });
      
      // Создаем ссылку для скачивания
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', filename);
      
      // Добавляем ссылку в DOM, кликаем и удаляем
      document.body.appendChild(link);
      link.click();
      
      // Очищаем
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      }, 100);

      setSnackbar({
        open: true,
        message: `Report exported as ${format.toUpperCase()}`,
        severity: 'success'
      });

    } catch (err) {
      console.error(`Export to ${format} failed:`, err);
      
      // Пытаемся прочитать ошибку из ответа, если это JSON
      if (err.response && err.response.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          const errorData = JSON.parse(text);
          setSnackbar({
            open: true,
            message: `Export failed: ${errorData.detail || errorData.message || 'Unknown error'}`,
            severity: 'error'
          });
        } catch {
          setSnackbar({
            open: true,
            message: `Export failed: Server error (${err.response.status})`,
            severity: 'error'
          });
        }
      } else {
        setSnackbar({
          open: true,
          message: `Export failed: ${err.message || 'Network error'}`,
          severity: 'error'
        });
      }
    } finally {
      setExportLoading(false);
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          VM Inventory Report
        </Typography>
        
        <ButtonGroup variant="contained" aria-label="export buttons" disabled={exportLoading}>
          <Button
            onClick={() => handleExport('pdf')}
            startIcon={<PdfIcon />}
            disabled={exportLoading}
            sx={{ 
              bgcolor: '#dc3545', 
              '&:hover': { bgcolor: '#c82333' },
              '&.Mui-disabled': { bgcolor: '#dc3545', opacity: 0.5 }
            }}
          >
            PDF
          </Button>
          <Button
            onClick={() => handleExport('xlsx')}
            startIcon={<ExcelIcon />}
            disabled={exportLoading}
            sx={{ 
              bgcolor: '#28a745', 
              '&:hover': { bgcolor: '#218838' },
              '&.Mui-disabled': { bgcolor: '#28a745', opacity: 0.5 }
            }}
          >
            Excel
          </Button>
          <Button
            onClick={() => handleExport('json')}
            startIcon={<JsonIcon />}
            disabled={exportLoading}
            sx={{ 
              bgcolor: '#ffc107', 
              color: '#000',
              '&:hover': { bgcolor: '#e0a800' },
              '&.Mui-disabled': { bgcolor: '#ffc107', opacity: 0.5 }
            }}
          >
            JSON
          </Button>
        </ButtonGroup>
      </Box>

      {exportLoading && (
        <Box display="flex" justifyContent="center" my={2}>
          <CircularProgress size={24} />
          <Typography variant="body2" sx={{ ml: 1 }}>
            Generating export...
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        {reportData ? (
          <ReportTree data={reportData} />
        ) : (
          <Typography color="text.secondary" align="center">
            No data available
          </Typography>
        )}
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Reports;