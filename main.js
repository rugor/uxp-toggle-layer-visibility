const photoshop = require('photoshop')
const app = photoshop.app
const batchPlay = photoshop.action.batchPlay
const core = photoshop.core
const fs = require('uxp').storage.localFileSystem

// Wait for the DOM to load
document.addEventListener('DOMContentLoaded', function () {
  // Get UI elements
  const visibilityCheckbox = document.getElementById('visibilityCheckbox')
  const updateButton = document.getElementById('updateButton')
  const exportButton = document.getElementById('exportButton')

  // Add click event listener to update button
  updateButton.addEventListener('click', async () => {
    try {
      // Get the state of the checkbox
      const makeVisible = visibilityCheckbox.checked
      console.log(
        `Update button clicked. Setting all layers to: ${
          makeVisible ? 'visible' : 'hidden'
        }`
      )

      // Get the active document
      const doc = app.activeDocument
      if (!doc) {
        console.log('No active document found')
        return
      }
      console.log('Active document found:', doc.title)

      // Execute as modal
      await core.executeAsModal(
        async () => {
          // Get all layers and set visibility
          await setAllLayersVisibility(doc.layers, makeVisible)
        },
        { commandName: 'Toggle All Layer Visibility' }
      )
    } catch (error) {
      console.error('Error toggling layer visibility:', error)
    }
  })

  // Add click event listener to export button
  exportButton.addEventListener('click', async () => {
    try {
      console.log('Export button clicked')

      // Get the active document
      const doc = app.activeDocument
      if (!doc) {
        console.log('No active document found')
        alert('Please open a document first')
        return
      }

      console.log(`Document: ${doc.title}`)
      console.log(`Total layers in document: ${doc.layers.length}`)
      
      // Debug: Log all layers and their visibility
      await logLayerStructure(doc.layers, 0)

      // Ask user to select export directory
      const folder = await fs.getFolder()
      if (!folder) {
        console.log('No folder selected')
        return
      }

      console.log('Export folder selected:', folder.nativePath)

      // Execute as modal
      await core.executeAsModal(
        async () => {
          const totalExported = await exportVisibleLayers(doc.layers, folder)
          console.log(`Total layers exported: ${totalExported}`)
        },
        { commandName: 'Export Layers as PNG' }
      )

      alert('Export completed!')
    } catch (error) {
      console.error('Error exporting layers:', error)
      alert('Error exporting layers: ' + error.message)
    }
  })
})

// Debug function to log layer structure
async function logLayerStructure(layers, depth) {
  const indent = '  '.repeat(depth)
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]
    console.log(`${indent}Layer: "${layer.name}", visible: ${layer.visible}, kind: ${layer.kind}, hasLayers: ${!!(layer.layers && layer.layers.length > 0)}`)
    
    if (layer.layers && layer.layers.length > 0) {
      await logLayerStructure(layer.layers, depth + 1)
    }
  }
}

// Recursive function to set visibility for all layers including in groups
async function setAllLayersVisibility(layers, isVisible) {
  console.log(
    `Processing ${layers.length} layers, setting to ${
      isVisible ? 'visible' : 'hidden'
    }`
  )

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]

    // Set this layer's visibility
    try {
      layer.visible = isVisible
      console.log(
        `Set layer "${layer.name}" to ${isVisible ? 'visible' : 'hidden'}`
      )

      // If this is a group, process its children recursively
      if (layer.layers && layer.layers.length > 0) {
        await setAllLayersVisibility(layer.layers, isVisible)
      }
    } catch (err) {
      console.error(`Error setting visibility for layer "${layer.name}":`, err)
    }
  }
}

// Recursive function to export all visible layers as PNG files
async function exportVisibleLayers(layers, folder) {
  console.log(`Processing ${layers.length} layers for export`)
  let exportCount = 0

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]

    try {
      // If this is a group, process its children recursively
      if (layer.layers && layer.layers.length > 0) {
        console.log(`Processing group: ${layer.name}`)
        const childCount = await exportVisibleLayers(layer.layers, folder)
        exportCount += childCount
      } else if (layer.visible && layer.kind !== 'groupEnd') {
        console.log(`Found visible layer to export: ${layer.name}, kind: ${layer.kind}`)
        // Export this visible layer
        await exportLayerAsPNG(layer, folder)
        exportCount++
      } else {
        console.log(`Skipping layer: ${layer.name}, visible: ${layer.visible}, kind: ${layer.kind}`)
      }
    } catch (err) {
      console.error(`Error processing layer "${layer.name}":`, err)
    }
  }
  
  console.log(`Exported ${exportCount} layers from this level`)
  return exportCount
}

// Function to export a single layer as PNG
async function exportLayerAsPNG(layer, folder) {
  try {
    console.log(`Exporting layer: ${layer.name}`)

    // Create filename from layer name (it already has the file suffix)
    let fileName = layer.name
    // Clean up the filename to be filesystem-safe
    fileName = fileName.replace(/[<>:"/\\|?*]/g, '_')
    // Ensure it ends with .png if not already specified
    if (!fileName.toLowerCase().endsWith('.png')) {
      fileName += '.png'
    }

    // Save current state
    const doc = app.activeDocument
    const originalActiveLayer = doc.activeLayer
    
    // Store all layer visibility states
    const layerStates = new Map()
    await storeLayerVisibility(doc.layers, layerStates)
    
    try {
      // Hide all layers first
      await setAllLayersVisibility(doc.layers, false)
      
      // Show only the target layer
      layer.visible = true
      doc.activeLayer = layer

      // Create the file using UXP file system API
      const file = await folder.createFile(fileName, { overwrite: true })

      console.log(`Saving PNG with transparency for layer: ${layer.name}`)
      
      // Use the reliable saveAs.png method
      await doc.saveAs.png(file, {
        compression: 0,
        embedColorProfile: true,
        transparency: true,
        interlaced: false
      })

      console.log(`Successfully exported: ${fileName}`)
      
    } finally {
      // Always restore the original state
      await restoreLayerVisibility(doc.layers, layerStates)
      doc.activeLayer = originalActiveLayer
    }

  } catch (error) {
    console.error(`Error exporting layer "${layer.name}":`, error)
    throw error
  }
}

// Helper function to store current layer visibility state
async function storeLayerVisibility(layers, layerStates) {
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]
    layerStates.set(layer.id, layer.visible)
    
    if (layer.layers && layer.layers.length > 0) {
      await storeLayerVisibility(layer.layers, layerStates)
    }
  }
}

// Helper function to restore layer visibility from stored state
async function restoreLayerVisibility(layers, layerStates) {
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]
    if (layerStates.has(layer.id)) {
      try {
        layer.visible = layerStates.get(layer.id)
      } catch (err) {
        console.error(`Error restoring visibility for layer "${layer.name}":`, err)
      }
    }
    
    if (layer.layers && layer.layers.length > 0) {
      await restoreLayerVisibility(layer.layers, layerStates)
    }
  }
}
