import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import StudentDashboard from '@/app/components/student/StudentDashboard';
import AdminView from '@/app/components/Admin/AdminView';
import LoginScreen, { type ModoAuth } from '@/app/components/auth/LoginScreen';

const usuario = { id: '11111111-2222-3333-4444-555555555555', email: 'gaepmalaga@gmail.com', role: 'admin' };

// ?vista=admin para el panel, ?vista=login para la puerta de entrada;
// por defecto, el alumno.
const vista = new URLSearchParams(location.search).get('vista');

/**
 * La pantalla de entrada, con sus dos modos y sus dos avisos a la vez.
 *
 * Se pintan el error Y el aviso juntos a proposito, aunque en la aplicacion
 * real solo salga uno: el banco mide desbordes y contraste, y lo que no se
 * pinta no se mide. Era justo el punto ciego de esta pantalla — no estaba ni
 * aqui ni en la guarda del sistema de diseno.
 */
function Entrada() {
  const [modo, setModo] = useState<ModoAuth>('login');
  return (
    <LoginScreen
      modo={modo}
      onModo={setModo}
      onSubmit={() => console.log('submit')}
      cargando={false}
      error="Correo o contraseña incorrectos. Revísalos y vuelve a intentarlo."
      aviso="Cuenta creada. Te hemos enviado un correo a alumno.prueba@atenea-test.local: pulsa el enlace para confirmarla y ya podrás entrar."
    />
  );
}

createRoot(document.getElementById('raiz')!).render(
  vista === 'admin' ? <AdminView user={usuario as never} onLogout={() => console.log('logout')} />
  : vista === 'login' ? <Entrada />
  : <StudentDashboard user={usuario as never} onLogout={() => console.log('logout')} />,
);
