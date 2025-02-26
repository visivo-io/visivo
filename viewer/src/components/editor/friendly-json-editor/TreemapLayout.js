import React, { useState, useEffect, useRef } from 'react';

/**
 * TreemapLayout component that organizes cards in an icicle chart layout
 * This arranges items in a hierarchical structure with Props in the top-left
 * and ensures no scrolling within boxes by adjusting heights appropriately
 */
const TreemapLayout = ({ children, className = "", gap = 12 }) => {
  const containerRef = useRef(null);
  const [layout, setLayout] = useState([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const childRefs = useRef([]);

  // Initialize childRefs
  useEffect(() => {
    if (children) {
      childRefs.current = Array(React.Children.count(children))
        .fill()
        .map((_, i) => childRefs.current[i] || React.createRef());
    }
  }, [children]);

  // Calculate layout when children or container dimensions change
  useEffect(() => {
    if (!containerRef.current || !children || children.length === 0) return;

    const updateLayout = () => {
      const containerWidth = containerRef.current.offsetWidth;
      
      // Get children with their sizes and content info
      const childrenArray = React.Children.toArray(children);
      const childSizes = [];
      
      // Find the Props card index
      let propsIndex = -1;
      childrenArray.forEach((child, index) => {
        // Check if this is the Props card by looking at the h3 content
        const propsElement = child?.props?.children?.props?.children?.[0]?.props?.children?.[0];
        if (propsElement && propsElement.props && propsElement.props.children === 'Props') {
          propsIndex = index;
        }
      });
      
      // Use actual measured sizes if available, otherwise use defaults
      childrenArray.forEach((child, index) => {
        const childRef = childRefs.current[index];
        let width = 300; // Default width
        let height = 200; // Default height
        let contentSize = 1; // Default content size
        let isPriority = index === propsIndex; // Is this the Props card?
        
        // If we have a ref and it's mounted, use its dimensions
        if (childRef && childRef.current) {
          const rect = childRef.current.getBoundingClientRect();
          width = Math.max(rect.width, 200);
          
          // For height, we need to check the actual content height
          // Get all the content inside the child
          const contentElements = childRef.current.querySelectorAll('*');
          let contentHeight = 0;
          
          // Calculate the total height of all content
          contentElements.forEach(element => {
            const elementRect = element.getBoundingClientRect();
            contentHeight = Math.max(contentHeight, elementRect.bottom - rect.top);
          });
          
          // Use the content height or a minimum height
          height = Math.max(contentHeight + 20, 150); // Add padding
          
          // Try to determine content size (number of properties)
          // Look for a span with text like "(7 properties)" or "(2 items)"
          const spans = childRef.current.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent;
            const match = text && text.match(/\((\d+)\s+(properties|items)\)/);
            if (match) {
              contentSize = parseInt(match[1], 10);
              break;
            }
          }
          
          // Check if this is the "Props" card by looking at the header text
          const headers = childRef.current.querySelectorAll('h3');
          for (const header of headers) {
            if (header.textContent.toLowerCase() === 'props') {
              isPriority = true;
              break;
            }
          }
        }
        
        childSizes.push({
          index,
          width,
          height,
          area: width * height,
          contentSize,
          isPriority
        });
      });

      // Calculate layout using a content-aware icicle chart approach
      const newLayout = calculateContentAwareLayout(childSizes, containerWidth, gap);
      
      // Calculate total height needed
      const totalHeight = newLayout.reduce((max, item) => 
        Math.max(max, item.y + item.height), 0) + gap;
      
      setDimensions({ width: containerWidth, height: totalHeight });
      setLayout(newLayout);
    };

    // Initial layout calculation
    updateLayout();

    // Add resize listener
    const resizeObserver = new ResizeObserver(() => {
      updateLayout();
    });
    
    resizeObserver.observe(containerRef.current);
    
    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
  }, [children, gap]);

  // Render the layout
  return (
    <div 
      ref={containerRef} 
      className={`relative ${className}`}
      style={{ minHeight: dimensions.height }}
    >
      {React.Children.map(children, (child, index) => {
        const item = layout[index];
        if (!item) return null;
        
        return (
          <div
            ref={childRefs.current[index]}
            className="absolute transition-all duration-300 ease-in-out"
            style={{
              left: item.x,
              top: item.y,
              width: item.width,
              height: 'auto', // Allow height to adjust to content
              minHeight: item.height,
              overflow: 'visible' // Allow content to be visible
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Calculate a content-aware layout that prioritizes Props and items with more content
 * and ensures no scrolling within boxes
 * 
 * @param {Array} items - Array of items with width, height, area, contentSize and isPriority
 * @param {number} containerWidth - Width of the container
 * @param {number} gap - Gap between items
 * @returns {Array} - Layout positions for each item
 */
function calculateContentAwareLayout(items, containerWidth, gap) {
  if (items.length === 0) return [];
  
  const result = [];
  const availableWidth = containerWidth - (2 * gap);
  
  // Separate the "Add Property" button (usually the last item)
  const addPropertyButton = items[items.length - 1];
  const contentItems = items.slice(0, items.length - 1);
  
  // First, prioritize the Props card if it exists
  // Then sort by content size, then by area
  const sortedItems = [...contentItems].sort((a, b) => {
    // Props card always comes first
    if (a.isPriority && !b.isPriority) return -1;
    if (!a.isPriority && b.isPriority) return 1;
    
    // Then sort by content size
    if (b.contentSize !== a.contentSize) {
      return b.contentSize - a.contentSize;
    }
    
    // Finally sort by area
    return b.area - a.area;
  });
  
  // Use actual measured heights instead of fixed row heights
  let currentY = gap;
  
  // First row: Main item (Props or largest/most content)
  if (sortedItems.length > 0) {
    const mainItem = sortedItems[0];
    const mainItemHeight = mainItem.height;
    
    result[mainItem.index] = {
      index: mainItem.index,
      x: gap,
      y: currentY,
      width: availableWidth / 2 - gap/2, // Take up half the width
      height: mainItemHeight
    };
    
    // Second column (right side of first row)
    if (sortedItems.length > 1) {
      const secondItem = sortedItems[1];
      const secondItemHeight = Math.max(mainItemHeight / 2 - gap/2, secondItem.height);
      
      result[secondItem.index] = {
        index: secondItem.index,
        x: gap + availableWidth / 2 + gap/2,
        y: currentY,
        width: availableWidth / 2 - gap/2,
        height: secondItemHeight
      };
      
      // Bottom of second column
      if (sortedItems.length > 2) {
        const thirdItem = sortedItems[2];
        const thirdItemHeight = Math.max(mainItemHeight / 2 - gap/2, thirdItem.height);
        
        result[thirdItem.index] = {
          index: thirdItem.index,
          x: gap + availableWidth / 2 + gap/2,
          y: currentY + secondItemHeight + gap,
          width: availableWidth / 2 - gap/2,
          height: thirdItemHeight
        };
        
        // Update the first row height to accommodate both items in the second column
        const totalSecondColumnHeight = secondItemHeight + gap + thirdItemHeight;
        if (totalSecondColumnHeight > mainItemHeight) {
          result[mainItem.index].height = totalSecondColumnHeight;
        }
      }
    }
    
    // Update currentY based on the tallest element in the first row
    const firstRowMaxHeight = Math.max(
      result[mainItem.index].height,
      sortedItems.length > 1 ? result[sortedItems[1].index].height + 
        (sortedItems.length > 2 ? gap + result[sortedItems[2].index].height : 0) : 0
    );
    
    currentY += firstRowMaxHeight + gap;
  }
  
  // Second row: Next 2-4 items
  if (sortedItems.length > 3) {
    const secondRowItems = sortedItems.slice(3, 7);
    const itemCount = secondRowItems.length;
    
    if (itemCount > 0) {
      const itemWidth = (availableWidth - (itemCount - 1) * gap) / itemCount;
      let maxRowHeight = 0;
      
      secondRowItems.forEach((item, idx) => {
        result[item.index] = {
          index: item.index,
          x: gap + idx * (itemWidth + gap),
          y: currentY,
          width: itemWidth,
          height: item.height
        };
        
        maxRowHeight = Math.max(maxRowHeight, item.height);
      });
      
      // Ensure all items in this row have the same height
      secondRowItems.forEach((item) => {
        result[item.index].height = maxRowHeight;
      });
      
      currentY += maxRowHeight + gap;
    }
  }
  
  // Third row: Remaining items
  if (sortedItems.length > 7) {
    const thirdRowItems = sortedItems.slice(7);
    const itemCount = thirdRowItems.length;
    
    if (itemCount > 0) {
      const itemWidth = (availableWidth - (itemCount - 1) * gap) / itemCount;
      let maxRowHeight = 0;
      
      thirdRowItems.forEach((item, idx) => {
        result[item.index] = {
          index: item.index,
          x: gap + idx * (itemWidth + gap),
          y: currentY,
          width: itemWidth,
          height: item.height
        };
        
        maxRowHeight = Math.max(maxRowHeight, item.height);
      });
      
      // Ensure all items in this row have the same height
      thirdRowItems.forEach((item) => {
        result[item.index].height = maxRowHeight;
      });
      
      currentY += maxRowHeight + gap;
    }
  }
  
  // Position the "Add Property" button at the bottom
  result[addPropertyButton.index] = {
    index: addPropertyButton.index,
    x: gap,
    y: currentY,
    width: availableWidth,
    height: 60 // Fixed height for the button
  };
  
  return result;
}

export default TreemapLayout; 