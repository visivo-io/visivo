import React from 'react';
import Snackbar from '@mui/material/Snackbar';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';

const SnackBar = ({ message, open, setOpen }) => {
  const handleClose = () => {
    setOpen(false)
  }

  const action = (
    <React.Fragment>
      <IconButton
        size="small"
        aria-label="close"
        color="inherit"
        onClick={handleClose}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </React.Fragment>
  );

  return (
   <Snackbar
      open={open}
      autoHideDuration={6000}
      onClose={handleClose}
      message={message}
      action={action}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      ContentProps={{
        sx: {
          backgroundColor: '#DBFCE7', 
          color: '#016F77', 
          border: '1px solid #bfdbfe', 
          borderRadius: '8px',
        }
      }}
    />
  )
}

export default SnackBar