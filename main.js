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
          await exportVisibleLayers(doc.layers, folder)
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

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]

    try {
      // If this is a group, process its children recursively
      if (layer.layers && layer.layers.length > 0) {
        await exportVisibleLayers(layer.layers, folder)
      } else if (layer.visible && layer.kind !== 'groupEnd') {
        // Export this visible layer
        await exportLayerAsPNG(layer, folder)
      }
    } catch (err) {
      console.error(`Error processing layer "${layer.name}":`, err)
    }
  }
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

      // Create the file path for export
      const filePath = folder.nativePath + '/' + fileName

      // Export using batchPlay
      await batchPlay([
        {
          _obj: 'exportDocument',
          _target: [{ _ref: 'document', _enum: 'ordinal', _value: 'targetEnum' }],
          as: {
            _obj: 'PNGFormat',
            transparency: true,
            interlaced: false
          },
          in: {
            _path: filePath,
            _kind: 'local'
          },
          _options: {
            dialogOptions: 'dontDisplay'
          }
        }
      ])

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
