Fundamentos de sistemas operativos

CONCEPTO

Un sistema operativo es el conjunto de programas que gestiona los recursos del ordenador y actúa como intermediario entre el hardware y el usuario o las aplicaciones. Sin él, cada programa tendría que conocer y controlar directamente el hardware.

FUNCIONES DE UN SISTEMA OPERATIVO

GESTIÓN DE PROCESOS. Un proceso es un programa en ejecución. El sistema lo crea, lo suspende, lo reanuda y lo termina, y reparte el tiempo de procesador entre todos mediante un planificador. La multitarea es la ejecución aparentemente simultánea de varios procesos alternando su acceso al procesador.

GESTIÓN DE MEMORIA. Asigna y libera memoria principal, lleva el control de qué zona usa cada proceso e impide que uno invada la de otro. La MEMORIA VIRTUAL permite ejecutar programas mayores que la memoria física usando espacio de disco como extensión, mediante paginación o segmentación.

GESTIÓN DE ALMACENAMIENTO Y DE ARCHIVOS. Organiza la información en archivos y directorios, controla el espacio libre y gestiona los permisos de acceso.

GESTIÓN DE ENTRADA Y SALIDA. Se comunica con los periféricos a través de los CONTROLADORES O DRIVERS, que traducen las órdenes genéricas del sistema al lenguaje de cada dispositivo.

SEGURIDAD Y PROTECCIÓN. Autenticación de usuarios, control de acceso a los recursos, registro de actividad y aislamiento entre procesos.

INTERFAZ DE USUARIO. En línea de comandos (CLI) o gráfica (GUI).

El NÚCLEO O KERNEL es la parte del sistema operativo que se ejecuta con privilegios máximos y que gestiona directamente el hardware. Se distinguen núcleos MONOLÍTICOS (Linux), MICRONÚCLEOS y HÍBRIDOS (Windows NT, macOS).

TIPOLOGÍAS

MS-DOS. Sistema de Microsoft de los años ochenta. Monousuario y monotarea, sin interfaz gráfica: se maneja por línea de comandos. Utiliza el sistema de archivos FAT y asigna letras a las unidades. Comandos característicos: DIR, CD, COPY, DEL, FORMAT. Las primeras versiones de Windows funcionaban sobre él.

UNIX. Desarrollado a partir de 1969 en los laboratorios Bell por Ken Thompson y Dennis Ritchie. Multiusuario y multitarea desde el origen, escrito en lenguaje C, lo que lo hizo portable. Su filosofía —programas pequeños que hacen una sola cosa y se combinan mediante tuberías— está en la base de todos los sistemas posteriores de su familia. De él derivan Solaris, AIX, HP-UX y los sistemas BSD.

LINUX. Núcleo creado por Linus Torvalds en 1991, publicado bajo licencia GPL (software libre). En rigor, Linux es el núcleo; el sistema completo se denomina GNU/Linux, porque combina ese núcleo con las herramientas del proyecto GNU de Richard Stallman. Se distribuye en DISTRIBUCIONES: Debian, Ubuntu, Fedora, Red Hat, CentOS, Kali (orientada a auditoría de seguridad). Es multiusuario, multitarea, de código abierto y predominante en servidores y supercomputación. Su estructura de directorios parte de la raíz («/») y no usa letras de unidad.

WINDOWS. Familia de Microsoft. Desde Windows NT abandona la base de MS-DOS y adopta un núcleo híbrido. Es el sistema de escritorio más extendido. Usa los sistemas de archivos FAT32 y sobre todo NTFS, que añade permisos, cifrado, registro de transacciones y soporte de archivos grandes. Su base de configuración es el Registro de Windows.

MAC OS. Sistema de Apple para sus ordenadores. Desde la versión X está construido sobre una base UNIX (Darwin, derivado de BSD), lo que explica que disponga de terminal con comandos UNIX. Usa el sistema de archivos APFS, que sustituyó a HFS+.

SISTEMAS OPERATIVOS MÓVILES

iOS. Sistema de Apple para iPhone y iPad, derivado de macOS y por tanto de base UNIX. Es un sistema CERRADO: la instalación de aplicaciones se canaliza por la tienda oficial y el fabricante controla hardware y software. Emplea un modelo estricto de aislamiento de aplicaciones (sandbox) y cifrado del dispositivo. La modificación no autorizada para saltar esas restricciones se conoce como jailbreak.

ANDROID. Desarrollado por Google sobre el núcleo Linux. Es de código abierto (Android Open Source Project), lo que permite que cada fabricante lo adapte. Las aplicaciones se distribuyen en paquetes APK, principalmente a través de Google Play, aunque admite instalación desde otras fuentes, lo que amplía la superficie de riesgo. El acceso privilegiado no autorizado se denomina root.

Ambos comparten un modelo de PERMISOS por aplicación, que es el punto donde se concentra buena parte del riesgo de privacidad.

SISTEMAS DE ALMACENAMIENTO

Por la tecnología:
DISCO DURO MECÁNICO (HDD): platos magnéticos giratorios y cabezales. Mayor capacidad por euro, más lento y sensible a golpes.
UNIDAD DE ESTADO SÓLIDO (SSD): memoria flash, sin partes móviles. Mucho más rápida y resistente.
Memorias flash extraíbles: USB, tarjetas SD.
Óptico: CD, DVD, Blu-ray.
Cinta magnética: aún se usa para copias de seguridad de gran volumen y larga conservación.

Por su situación: almacenamiento LOCAL, en RED (NAS y SAN) y en la NUBE.

RAID es la agrupación de varios discos para trabajar como uno solo. Los niveles más citados: RAID 0 distribuye los datos entre discos y gana velocidad pero no ofrece tolerancia a fallos; RAID 1 duplica en espejo; RAID 5 distribuye datos y paridad y tolera el fallo de un disco.

Desde el punto de vista policial importa que el BORRADO ORDINARIO no elimina la información: marca el espacio como disponible. De ahí que sea posible la recuperación forense de datos y que la destrucción segura requiera sobrescritura o cifrado. En los SSD, sin embargo, mecanismos internos como el TRIM pueden eliminar los datos de forma irreversible en poco tiempo, lo que exige precauciones específicas en la incautación.

SISTEMAS DE ARCHIVOS

Un sistema de archivos es la estructura lógica que define cómo se nombran, almacenan, organizan y recuperan los datos en un dispositivo. Determina el tamaño máximo de archivo, el de la partición, los permisos y los metadatos.

FAT32. Muy compatible con cualquier sistema, pero limitado a archivos de 4 GB.
exFAT. Pensado para memorias extraíbles, sin la limitación de tamaño de FAT32.
NTFS. El de Windows: permisos, cifrado, cuotas, registro de transacciones (journaling).
ext4. El habitual en Linux, con journaling.
APFS y HFS+. Los de Apple.

Conceptos asociados: PARTICIÓN (división lógica de un dispositivo físico), FORMATEO (creación de la estructura del sistema de archivos), tablas de particiones MBR y GPT, y METADATOS del archivo (nombre, tamaño, permisos y marcas de tiempo de creación, modificación y acceso), que en el análisis forense son con frecuencia tan relevantes como el contenido.
