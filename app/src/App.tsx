import Toolbar from './components/Toolbar/Toolbar';
import SketchPad from './components/SketchPad/SketchPad';
import PropertyPanel from './components/PropertyPanel/PropertyPanel';
import ResultsView from './components/ResultsView/ResultsView';
import TransientChart from './components/TransientChart/TransientChart';
import StatusBar from './components/StatusBar/StatusBar';

function App() {
  return (
    <div className="flex flex-col h-screen w-screen">
      <Toolbar />
      <div className="flex flex-1 min-h-0">
        <SketchPad />
        <PropertyPanel />
      </div>
      <ResultsView />
      <TransientChart />
      <StatusBar />
    </div>
  );
}

export default App
