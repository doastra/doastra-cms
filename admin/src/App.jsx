import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth, SiteProvider } from './context.jsx';
import { Spinner, Empty } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PagesList from './pages/PagesList.jsx';
import PageEdit from './pages/PageEdit.jsx';
import EntriesList from './pages/EntriesList.jsx';
import EntryEdit from './pages/EntryEdit.jsx';
import SectionTypes from './pages/SectionTypes.jsx';
import SectionTypeEdit from './pages/SectionTypeEdit.jsx';
import ContentTypes from './pages/ContentTypes.jsx';
import ContentTypeEdit from './pages/ContentTypeEdit.jsx';
import MediaLibrary from './pages/MediaLibrary.jsx';
import Taxonomies from './pages/Taxonomies.jsx';
import Menus from './pages/Menus.jsx';
import Settings from './pages/Settings.jsx';
import Forms from './pages/Forms.jsx';
import SiteUsers from './pages/SiteUsers.jsx';
import ApiDocs from './pages/ApiDocs.jsx';
import Sites from './pages/Sites.jsx';
import Users from './pages/Users.jsx';
import Account from './pages/Account.jsx';

function Home() {
  const { user } = useAuth();
  const last = Number(localStorage.getItem('dcms_site'));
  const site = user.sites.find((s) => s.id === last) || user.sites[0];
  if (site) return <Navigate to={`/s/${site.id}`} replace />;
  if (user.is_super_admin) return <Navigate to="/sites" replace />;
  return <Layout><Empty icon="🔒" title="No sites yet">Ask your administrator to give you access to a website.</Empty></Layout>;
}

function SiteArea() {
  const { siteId } = useParams();
  return (
    <SiteProvider siteId={siteId} key={siteId}>
      <Layout>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="pages" element={<PagesList />} />
          <Route path="pages/:id" element={<PageEdit />} />
          <Route path="content/:type" element={<EntriesList />} />
          <Route path="content/:type/:id" element={<EntryEdit />} />
          <Route path="media" element={<MediaLibrary />} />
          <Route path="taxonomies" element={<Taxonomies />} />
          <Route path="menus" element={<Menus />} />
          <Route path="forms" element={<Forms />} />
          <Route path="settings" element={<Settings />} />
          <Route path="team" element={<SiteUsers />} />
          <Route path="api" element={<ApiDocs />} />
          <Route path="sections" element={<SectionTypes />} />
          <Route path="sections/:id" element={<SectionTypeEdit />} />
          <Route path="content-types" element={<ContentTypes />} />
          <Route path="content-types/:id" element={<ContentTypeEdit />} />
          <Route path="*" element={<Empty icon="🤔" title="Page not found" />} />
        </Routes>
      </Layout>
    </SiteProvider>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/" element={<Home />} />
      <Route path="/s/:siteId/*" element={<SiteArea />} />
      <Route path="/sites" element={<Layout><Sites /></Layout>} />
      <Route path="/users" element={<Layout><Users /></Layout>} />
      <Route path="/account" element={<Layout><Account /></Layout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
