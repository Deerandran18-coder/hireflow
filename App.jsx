import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import Candidates from './pages/Candidates';
import CandidateDetail from './pages/CandidateDetail';
import Interviews from './pages/Interviews';
import Assessments from './pages/Assessments';
import Offers from './pages/Offers';
import Analytics from './pages/Analytics';
import Notifications from './pages/Notifications';

import PortalHome from './pages/portal/PortalHome';
import PortalJobs from './pages/portal/PortalJobs';
import PortalAssessments from './pages/portal/PortalAssessments';
import PortalAssessmentTake from './pages/portal/PortalAssessmentTake';
import PortalOffers from './pages/portal/PortalOffers';

function Protected({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

const STAFF = ['recruiter', 'admin', 'hiring_manager'];
const STAFF_PLUS_INTERVIEWER = ['recruiter', 'admin', 'hiring_manager', 'interviewer'];

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/dashboard" element={<Protected roles={STAFF}><Dashboard /></Protected>} />
      <Route path="/jobs" element={<Protected roles={STAFF}><Jobs /></Protected>} />
      <Route path="/jobs/:id" element={<Protected roles={STAFF}><JobDetail /></Protected>} />
      <Route path="/candidates" element={<Protected roles={STAFF_PLUS_INTERVIEWER}><Candidates /></Protected>} />
      <Route path="/candidates/:id" element={<Protected roles={STAFF_PLUS_INTERVIEWER}><CandidateDetail /></Protected>} />
      <Route path="/interviews" element={<Protected roles={STAFF_PLUS_INTERVIEWER}><Interviews /></Protected>} />
      <Route path="/assessments" element={<Protected roles={STAFF}><Assessments /></Protected>} />
      <Route path="/offers" element={<Protected roles={STAFF}><Offers /></Protected>} />
      <Route path="/analytics" element={<Protected roles={STAFF}><Analytics /></Protected>} />
      <Route path="/notifications" element={<Protected roles={STAFF}><Notifications /></Protected>} />

      <Route path="/portal" element={<Protected roles={['candidate']}><PortalHome /></Protected>} />
      <Route path="/portal/jobs" element={<Protected roles={['candidate']}><PortalJobs /></Protected>} />
      <Route path="/portal/assessments" element={<Protected roles={['candidate']}><PortalAssessments /></Protected>} />
      <Route path="/portal/assessments/:id" element={<Protected roles={['candidate']}><PortalAssessmentTake /></Protected>} />
      <Route path="/portal/offers" element={<Protected roles={['candidate']}><PortalOffers /></Protected>} />

      <Route path="/" element={<Navigate to={user ? (user.role === 'candidate' ? '/portal' : user.role === 'interviewer' ? '/interviews' : '/dashboard') : '/login'} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
