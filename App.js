import React, { useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import RNFS from 'react-native-fs';

const App = () => {
  const [url, setUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloads, setDownloads] = useState([]);

  const downloadVideo = async () => {
    if (!url) {
      Alert.alert('Error', 'Please enter a YouTube URL');
      return;
    }

    setDownloading(true);
    setDownloadProgress(0);

    try {
      // Step 1: Get audio URL from backend
      console.log('Connecting to backend...');
      const backendUrl = 'http://10.0.2.2:3000/api/get-audio-url';
      
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      
      if (!response.ok) {
        throw new Error('Backend request failed');
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to process video');
      }
      
      console.log('Got audio URL from backend');
      const title = data.title.replace(/[^\w\s]/gi, '').substring(0, 50); // Clean and limit title
      
      // Step 2: Download the audio file
      // For Android 10+, we'll use app-specific storage first, then copy to Downloads
      const tempPath = `${RNFS.DocumentDirectoryPath}/${title}.mp3`;
      
      console.log('Starting download...');
      const downloadResult = await RNFS.downloadFile({
        fromUrl: data.audioUrl,
        toFile: tempPath,
        progress: (res) => {
          const progress = (res.bytesWritten / res.contentLength) * 100;
          setDownloadProgress(progress);
          console.log(`Download progress: ${progress.toFixed(2)}%`);
        },
        progressDivider: 1,
        begin: (res) => {
          console.log('Download started', res);
        },
      }).promise;
      
      if (downloadResult.statusCode === 200) {
        // Try to copy to Downloads folder (if permissions allow)
        let finalPath = tempPath;
        let savedToDownloads = false;
        
        try {
          const downloadDir = `${RNFS.DownloadDirectoryPath}`;
          const publicPath = `${downloadDir}/${title}.mp3`;
          
          // Try to copy to public Downloads
          await RNFS.copyFile(tempPath, publicPath);
          finalPath = publicPath;
          savedToDownloads = true;
          console.log('Copied to Downloads folder');
        } catch (copyError) {
          console.log('Could not copy to Downloads, file saved in app storage', copyError);
        }
        
        // Add to downloads list
        setDownloads([...downloads, {
          title: title,
          path: finalPath,
          timestamp: new Date(),
          size: downloadResult.bytesWritten,
          inDownloads: savedToDownloads,
        }]);
        
        Alert.alert(
          'Success', 
          `Downloaded: ${title}.mp3\n\n${savedToDownloads ? 'Saved to Downloads folder' : 'Saved to app storage (permission denied for Downloads)'}`
        );
        setUrl('');
      } else {
        throw new Error('Download failed with status: ' + downloadResult.statusCode);
      }
      
    } catch (error) {
      console.error('Download error:', error);
      
      if (error.message.includes('Network request failed')) {
        Alert.alert(
          'Connection Error', 
          'Cannot connect to backend server.\n\nMake sure:\n1. Backend is running (node server.js)\n2. You see "Server running on http://localhost:3000"'
        );
      } else if (error.message.includes('Failed to connect')) {
        Alert.alert('Error', 'Failed to connect to YouTube. The video might be private or restricted.');
      } else {
        Alert.alert('Error', error.message || 'Failed to download video');
      }
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const showFileLocation = async () => {
    try {
      // Check both app storage and Downloads
      const appFiles = await RNFS.readDir(RNFS.DocumentDirectoryPath);
      const appMp3Files = appFiles.filter(file => file.name.endsWith('.mp3'));
      
      let downloadFiles = [];
      try {
        const downloadDir = `${RNFS.DownloadDirectoryPath}`;
        const files = await RNFS.readDir(downloadDir);
        downloadFiles = files.filter(file => file.name.endsWith('.mp3'));
      } catch (e) {
        console.log('Could not read Downloads folder');
      }
      
      const totalFiles = appMp3Files.length + downloadFiles.length;
      
      if (totalFiles === 0) {
        Alert.alert('No Files', 'No MP3 files found');
        return;
      }

      let fileList = '';
      
      if (downloadFiles.length > 0) {
        fileList += 'In Downloads folder:\n';
        fileList += downloadFiles.map(file => 
          `• ${file.name} (${formatBytes(file.size)})`
        ).join('\n');
      }
      
      if (appMp3Files.length > 0) {
        if (fileList) fileList += '\n\n';
        fileList += 'In app storage:\n';
        fileList += appMp3Files.map(file => 
          `• ${file.name} (${formatBytes(file.size)})`
        ).join('\n');
      }

      Alert.alert(
        'Downloaded Files',
        `Found ${totalFiles} MP3 files:\n\n${fileList}\n\nTip: Files in Downloads folder can be accessed with the Files app!`
      );
    } catch (error) {
      console.error('Error reading files:', error);
      Alert.alert('Error', 'Could not read files');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={styles.header}>
          <Text style={styles.title}>YouTube to MP3</Text>
          <Text style={styles.subtitle}>Download YouTube videos as MP3 files</Text>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Paste YouTube URL here..."
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          
          <TouchableOpacity
            style={[styles.button, downloading && styles.buttonDisabled]}
            onPress={downloadVideo}
            disabled={downloading}>
            <Text style={styles.buttonText}>
              {downloading ? 'Downloading...' : 'Download MP3'}
            </Text>
          </TouchableOpacity>

          {downloading && (
            <View style={styles.progressContainer}>
              <ActivityIndicator size="small" color="#ff0000" />
              <Text style={styles.progressText}>
                {downloadProgress > 0 
                  ? `Downloading: ${Math.round(downloadProgress)}%`
                  : 'Processing...'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.downloadsSection}>
          <View style={styles.downloadHeader}>
            <Text style={styles.sectionTitle}>Recent Downloads</Text>
            {downloads.length > 0 && (
              <TouchableOpacity onPress={showFileLocation} style={styles.showFilesButton}>
                <Text style={styles.showFilesText}>Show Files</Text>
              </TouchableOpacity>
            )}
          </View>
          {downloads.length === 0 ? (
            <Text style={styles.emptyText}>No downloads yet</Text>
          ) : (
            downloads.map((item, index) => (
              <View key={index} style={styles.downloadItem}>
                <Text style={styles.downloadTitle}>{item.title}</Text>
                <Text style={styles.downloadInfo}>
                  Size: {formatBytes(item.size)} • {item.inDownloads ? 'In Downloads folder' : 'In app storage'}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>About File Storage</Text>
          <Text style={styles.infoText}>
            Files are saved to app storage for compatibility.{'\n'}
            • Use the "Show Files" button to see all downloads{'\n'}
            • To access files on your PC, use:{'\n'}
            adb pull /data/data/com.youtubemp3downloader/files/songname.mp3{'\n\n'}
            Note: Modern Android restricts Downloads folder access
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#ff0000',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#ffffff',
    marginTop: 5,
  },
  inputContainer: {
    padding: 20,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  button: {
    backgroundColor: '#ff0000',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#cccccc',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    padding: 10,
  },
  progressText: {
    marginLeft: 10,
    color: '#666',
  },
  downloadsSection: {
    padding: 20,
  },
  downloadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  showFilesButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  showFilesText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#666',
    fontStyle: 'italic',
  },
  downloadItem: {
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  downloadTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  downloadInfo: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  infoSection: {
    padding: 20,
    backgroundColor: '#e3f2fd',
    margin: 20,
    borderRadius: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1976d2',
  },
  infoText: {
    fontSize: 14,
    color: '#1976d2',
    lineHeight: 22,
  },
});

export default App;