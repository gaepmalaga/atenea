import { createRoot } from 'react-dom/client';
import StudentDashboard from '@/app/components/student/StudentDashboard';
import AdminView from '@/app/components/Admin/AdminView';

const usuario = { id: '11111111-2222-3333-4444-555555555555', email: 'gaepmalaga@gmail.com', role: 'admin' };

// ?vista=admin para el panel; por defecto, el alumno.
const vista = new URLSearchParams(location.search).get('vista');

createRoot(document.getElementById('raiz')!).render(
  vista === 'admin'
    ? <AdminView user={usuario as never} onLogout={() => console.log('logout')} />
    : <StudentDashboard user={usuario as never} onLogout={() => console.log('logout')} />,
);
