import React, { useState, useEffect } from 'react';
// Исправляем путь к api - убираем "../", так как services находится в src
import api from '../services/api';

const Reports = () => {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

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
    try {
      const url = `/report/${format}/`;
      const filename = `vm_report.${format === 'xlsx' ? 'xlsx' : format}`;
      
      const response = await api.get(url, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      }, 100);

      alert(`Report exported as ${format.toUpperCase()}`);
    } catch (err) {
      console.error(`Export to ${format} failed:`, err);
      alert(`Export failed: ${err.message}`);
    } finally {
      setExportLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Loading report data...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={fetchReportData}>Retry</button>
      </div>
    );
  }

  const renderDepartment = (dept) => (
    <div key={dept.id} style={{ marginBottom: '20px', borderLeft: '3px solid #4CAF50', paddingLeft: '10px' }}>
      <h3 style={{ color: '#1A237E' }}>
        {dept.name}
        {dept.vm_count > dept.vm_quota && <span style={{ color: 'red', marginLeft: '10px' }}>⚠️</span>}
      </h3>
      <p>VMs: {dept.vm_count} | CPU: {dept.total_cpu} | RAM: {dept.total_ram} GB | Disk: {dept.total_disk} GB</p>
      {dept.streams && dept.streams.map(stream => renderStream(stream))}
    </div>
  );

  const renderStream = (stream) => (
    <div key={stream.id} style={{ marginLeft: '20px', marginBottom: '15px' }}>
      <h4 style={{ color: '#1A237E' }}>{stream.name}</h4>
      <p>VMs: {stream.vm_count} | CPU: {stream.total_cpu} | RAM: {stream.total_ram} GB | Disk: {stream.total_disk} GB</p>
      {stream.info_systems && stream.info_systems.map(isys => renderInfoSystem(isys))}
    </div>
  );

  const renderInfoSystem = (isys) => (
    <div key={isys.id} style={{ marginLeft: '20px', marginBottom: '10px' }}>
      <h5 style={{ color: '#1A237E' }}>{isys.name} ({isys.code})</h5>
      <p>VMs: {isys.vm_count} | CPU: {isys.total_cpu} | RAM: {isys.total_ram} GB | Disk: {isys.total_disk} GB</p>
      {isys.vms && isys.vms.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginLeft: '20px' }}>
          <thead>
            <tr style={{ backgroundColor: '#4CAF50', color: 'white' }}>
              <th style={{ padding: '5px' }}>FQDN</th>
              <th style={{ padding: '5px' }}>IP</th>
              <th style={{ padding: '5px' }}>CPU</th>
              <th style={{ padding: '5px' }}>RAM</th>
              <th style={{ padding: '5px' }}>Disk</th>
              <th style={{ padding: '5px' }}>Tags</th>
            </tr>
          </thead>
          <tbody>
            {isys.vms.map(vm => (
              <tr key={vm.fqdn} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '5px' }}>{vm.fqdn}</td>
                <td style={{ padding: '5px' }}>{vm.ip}</td>
                <td style={{ padding: '5px' }}>{vm.cpu}</td>
                <td style={{ padding: '5px' }}>{vm.ram}</td>
                <td style={{ padding: '5px' }}>{vm.disk}</td>
                <td style={{ padding: '5px' }}>{vm.tags?.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>VM Inventory Report</h1>
        <div>
          <button 
            onClick={() => handleExport('pdf')}
            disabled={exportLoading}
            style={{ 
              backgroundColor: '#dc3545', 
              color: 'white', 
              padding: '10px 20px', 
              marginRight: '10px',
              border: 'none',
              borderRadius: '4px',
              cursor: exportLoading ? 'not-allowed' : 'pointer',
              opacity: exportLoading ? 0.5 : 1
            }}
          >
            PDF
          </button>
          <button 
            onClick={() => handleExport('xlsx')}
            disabled={exportLoading}
            style={{ 
              backgroundColor: '#28a745', 
              color: 'white', 
              padding: '10px 20px', 
              marginRight: '10px',
              border: 'none',
              borderRadius: '4px',
              cursor: exportLoading ? 'not-allowed' : 'pointer',
              opacity: exportLoading ? 0.5 : 1
            }}
          >
            Excel
          </button>
          <button 
            onClick={() => handleExport('json')}
            disabled={exportLoading}
            style={{ 
              backgroundColor: '#ffc107', 
              color: 'black', 
              padding: '10px 20px',
              border: 'none',
              borderRadius: '4px',
              cursor: exportLoading ? 'not-allowed' : 'pointer',
              opacity: exportLoading ? 0.5 : 1
            }}
          >
            JSON
          </button>
        </div>
      </div>

      {exportLoading && <p>Generating export...</p>}

      {reportData && reportData.map(dept => renderDepartment(dept))}
    </div>
  );
};

export default Reports;