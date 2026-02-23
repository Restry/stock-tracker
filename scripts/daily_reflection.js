const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getSystemStats() {
  try {
    // Windows PowerShell Equivalents for Disk, Memory, and Load
    const diskOutput = execSync(`powershell -Command "$drive = Get-PSDrive C; [Math]::Round(($drive.Used / ($drive.Used + $drive.Free)) * 100, 2)"`).toString().trim();
    const memOutput = execSync(`powershell -Command "$os = Get-WmiObject Win32_OperatingSystem; $used = [Math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1024, 0); $total = [Math]::Round($os.TotalVisibleMemorySize / 1024, 0); Write-Output \\"$used/$total MB\\""`).toString().trim();
    const loadOutput = execSync(`powershell -Command "(Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average"`).toString().trim();
    
    return { 
      diskUsage: diskOutput + '%', 
      memUsage: memOutput, 
      cpuLoad: loadOutput + '%' 
    };
  } catch (e) {
    return { error: "Stats failed: " + e.message };
  }
}

function checkMemoryFile() {
  const date = new Date().toISOString().split('T')[0];
  // Adjust path for Surface environment
  const memFile = path.join('C:\\Users\\micha\\.openclaw\\workspace\\memory', `${date}.md`);
  if (fs.existsSync(memFile)) {
    const stats = fs.statSync(memFile);
    return { exists: true, size: stats.size + " bytes", path: memFile };
  } else {
    return { exists: false, checkedPath: memFile };
  }
}

const report = {
  timestamp: new Date().toISOString(),
  system: getSystemStats(),
  memory: checkMemoryFile()
};

console.log(JSON.stringify(report, null, 2));
