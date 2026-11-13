import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import DialogosHost from '@/app/components/ui/DialogosHost';
import StudentDashboard from '@/app/components/student/StudentDashboard';
import AdminView from '@/app/components/Admin/AdminView';
import LoginScreen, { type ModoAuth } from '@/app/components/auth/LoginScreen';
import PantallaCarga from '@/app/components/auth/PantallaCarga';
import SetPasswordScreen from '@/app/components/auth/SetPasswordScreen';
import SelectAcademyScreen from '@/app/components/auth/SelectAcademyScreen';
import AccessLocked from '@/app/components/auth/AccessLocked';

// `&rol=superadmin` enseña el panel del superadmin (Temario & IA, Consumo IA, Academias).
const usuario = { id: '11111111-2222-3333-4444-555555555555', email: 'gaepmalaga@gmail.com', role: new URLSearchParams(location.search).get('rol') === 'superadmin' ? 'superadmin' : 'admin' };

// ?vista=admin para el panel, ?vista=login para la puerta de entrada,
// ?vista=carga para la pantalla de carga; por defecto, el alumno. Las otras
// pantallas de entrada (regla 90): ?vista=clave, ?vista=clave-provisional
// (la del alta en bloque, regla 111), ?vista=academia y
// ?vista=bloqueado. Con &avisos=no, el login sale sin el error y el aviso.
const params = new URLSearchParams(location.search);
const vista = params.get('vista');
const sinAvisos = params.get('avisos') === 'no';

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
      onOlvido={() => console.log('olvido')}
      error={sinAvisos ? null : 'Correo o contraseña incorrectos. Revísalos y vuelve a intentarlo.'}
      aviso={sinAvisos ? null : 'Cuenta creada. Te hemos enviado un correo a alumno.prueba@atenea-test.local: pulsa el enlace para confirmarla y ya podrás entrar.'}
    />
  );
}

createRoot(document.getElementById('raiz')!).render(
  <>
  {vista === 'admin' ? <AdminView user={usuario as never} onLogout={() => console.log('logout')} />
  : vista === 'login' ? <Entrada />
  : vista === 'carga' ? <PantallaCarga />
  : vista === 'clave' ? <SetPasswordScreen email="preparador@alphapol.es" onSubmit={() => console.log('clave')} cargando={false} error={null} />
  : vista === 'clave-provisional' ? <SetPasswordScreen provisional email="alumno@correo.com" onSubmit={() => console.log('clave')} onLogout={() => console.log('logout')} cargando={false} error={null} />
  : vista === 'academia' ? <SelectAcademyScreen academias={[{ slug: 'alphapol', name: 'Alphapol' }, { slug: 'otra', name: 'Academia de prueba con un nombre largo' }]} email="alumno@correo.com" onLogout={() => console.log('logout')} />
  : vista === 'bloqueado' ? <AccessLocked motivo="pending" email="alumno@correo.com" onLogout={() => console.log('logout')} />
  : <StudentDashboard user={usuario as never} onLogout={() => console.log('logout')} />}
  <DialogosHost />
  </>,
);
