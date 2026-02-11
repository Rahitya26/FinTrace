import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Projects from './pages/Projects';
import Employees from './pages/Employees';
import Expenses from './pages/Expenses';

function App() {
  return (
    <Router>
      <Toaster position="top-right" richColors />
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/expenses" element={<Expenses />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
