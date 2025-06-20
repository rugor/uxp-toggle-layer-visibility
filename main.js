const photoshop = require('photoshop')
const app = photoshop.app
const batchPlay = photoshop.action.batchPlay
const core = photoshop.core

// Wait for the DOM to load
document.addEventListener('DOMContentLoaded', function () {
  // Get UI elements
  const visibilityCheckbox = document.getElementById('visibilityCheckbox')
  const updateButton = document.getElementById('updateButton')

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
